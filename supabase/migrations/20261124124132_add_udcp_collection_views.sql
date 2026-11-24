create table public.collection_views (
  scope text not null check (scope in ('production', 'practice')),
  owner_name text not null,
  doc_id text not null references public.documents(doc_id) on delete cascade,
  view_name text not null check (view_name in ('gt', 'udcp')),
  revision integer not null default 0,
  content jsonb not null default '{"periods":[],"metrics":[]}',
  primary key (scope, owner_name, doc_id),
  check ((scope = 'production') = (owner_name = ''))
);
alter table public.collection_views enable row level security;
revoke all on public.collection_views from public, anon, authenticated;

create function public.lock_gt_collection_view()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_scope text := 'production';
  v_owner text := '';
  v_view text;
begin
  if tg_relid = 'public.practice_collections'::regclass then
    if tg_op = 'INSERT' and new.revision = 0 then return new; end if;
    v_scope := 'practice';
    v_owner := new.analyst_name;
  end if;

  insert into public.collection_views(scope, owner_name, doc_id, view_name)
  values (v_scope, v_owner, new.doc_id, 'gt')
  on conflict (scope, owner_name, doc_id) do nothing;
  select view_name into v_view from public.collection_views
  where scope=v_scope and owner_name=v_owner and doc_id=new.doc_id;
  if v_view is distinct from 'gt' then
    raise exception 'This document is locked to UDCP' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.lock_gt_collection_view() from public, anon, authenticated;

create trigger lock_gt_production_view before insert or update on public.collections
for each row execute function public.lock_gt_collection_view();
create trigger lock_gt_practice_view before insert or update on public.practice_collections
for each row execute function public.lock_gt_collection_view();

create function public.udcp_api(p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_scope text := p_payload->>'scope';
  v_owner text;
  v_id text := p_payload->>'doc_id';
  v_choice text := p_payload->>'view';
  v_doc public.documents%rowtype;
  v_record public.collection_views%rowtype;
  v_content jsonb := p_payload->'content';
  v_period jsonb;
  v_has_gt boolean;
begin
  select s.analyst_name into v_name from public.code_sessions s
  join public.analyst_roster a using (analyst_name)
  where s.token::text=p_payload->>'session_token' and s.expires_at>now();
  if v_name is null then raise exception 'Sign in again' using errcode='42501'; end if;
  if v_scope is null or v_scope not in ('production','practice') then raise exception 'Invalid queue'; end if;
  v_owner := case when v_scope='practice' then v_name else '' end;

  select * into v_doc from public.documents d where d.doc_id=v_id and (
    (v_scope='production' and d.assigned_analyst=v_name)
    or (v_scope='practice' and exists(select 1 from public.practice_collections c where c.doc_id=d.doc_id and c.analyst_name=v_name))
  ) for share;
  if not found then raise exception 'Document is unavailable in this queue' using errcode='42501'; end if;

  v_has_gt := case when v_scope='production' then exists(select 1 from public.collections c where c.doc_id=v_id)
    else exists(select 1 from public.practice_collections c where c.doc_id=v_id and c.analyst_name=v_name and c.revision>0) end;
  if v_has_gt then
    insert into public.collection_views(scope, owner_name, doc_id, view_name)
    values (v_scope,v_owner,v_id,'gt') on conflict (scope,owner_name,doc_id) do nothing;
  end if;

  if p_action='choose' then
    if v_choice is null or v_choice not in ('gt','udcp') then raise exception 'Invalid collection view'; end if;
    insert into public.collection_views(scope, owner_name, doc_id, view_name)
    values (v_scope,v_owner,v_id,v_choice) on conflict (scope,owner_name,doc_id) do nothing;
  end if;
  select * into v_record from public.collection_views
  where scope=v_scope and owner_name=v_owner and doc_id=v_id;

  if p_action='save' then
    if v_record.view_name is distinct from 'udcp' then raise exception 'This document is not locked to UDCP' using errcode='42501'; end if;
    if jsonb_typeof(v_content->'periods') is distinct from 'array' or jsonb_typeof(v_content->'metrics') is distinct from 'array'
       or octet_length(v_content::text)>1000000 or jsonb_array_length(v_content->'periods')>100 or jsonb_array_length(v_content->'metrics')>5000 then
      raise exception 'Invalid collection payload';
    end if;
    for v_period in select value from jsonb_array_elements(v_content->'periods') loop
      if coalesce(v_period->>'type','') not in ('Annual','Quarter','Semi-Annual','Weeks','Days')
         or coalesce(v_period->>'number','') not in ('0','1','2','3','4')
         or ((v_period->>'type'='Annual') <> (v_period->>'number'='0')) then
        raise exception 'Choose a valid Period Type and Period Number for every header';
      end if;
    end loop;
    update public.collection_views set content=v_content,revision=revision+1
     where scope=v_scope and owner_name=v_owner and doc_id=v_id and revision=(p_payload->>'revision')::integer
     returning * into v_record;
    if not found then return jsonb_build_object('conflict',true,'error','This collection changed in another tab. Reload before saving.'); end if;
  elsif p_action is null or p_action not in ('open','choose') then
    raise exception 'Unknown collection action';
  end if;

  return jsonb_build_object('view',v_record.view_name,'revision',v_record.revision,'content',v_record.content,
    'document', jsonb_strip_nulls(jsonb_build_object('doc_id',v_doc.doc_id,'company_id',v_doc.company_id,
      'industry_name',v_doc.industry_name,'industry_code',v_doc.industry_code,'form_type',v_doc.form_type,
      'market',v_doc.market,'market_tier',v_doc.market_tier,'source_url',v_doc.source_url)));
end $$;
revoke all on function public.udcp_api(text,jsonb) from public, anon, authenticated;
grant execute on function public.udcp_api(text,jsonb) to anon;
