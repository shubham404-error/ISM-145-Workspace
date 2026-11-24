create table public.practice_collections (
  analyst_name text not null,
  doc_id text not null,
  context_json jsonb not null default '{}',
  rows_json jsonb not null default '[]',
  row_count integer not null default 0,
  status text not null default 'in progress'
    check (status in ('in progress', 'query raised', 'completed', 'audited', 'junk')),
  revision integer not null default 0,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  audited_at timestamptz,
  primary key (analyst_name, doc_id)
);

alter table public.practice_collections enable row level security;
revoke all on public.practice_collections from public, anon, authenticated;

create trigger enforce_practice_collection
before insert or update on public.practice_collections
for each row execute function public.validate_collection_launch();

create function public.practice_api(p_action text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_doc public.documents%rowtype;
  v_record public.practice_collections%rowtype;
  v_document jsonb;
  v_id text := pg_catalog.btrim(p_payload->>'doc_id');
  v_revision integer;
  v_status text;
begin
  select s.analyst_name into v_name
  from public.code_sessions s
  join public.analyst_roster a on a.analyst_name = s.analyst_name
  where s.token::text = p_payload->>'session_token' and s.expires_at > now();
  if v_name is null then
    raise exception 'Sign in again to open Practice' using errcode = '42501';
  end if;

  if p_action = 'list' then
    return jsonb_build_object('documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'doc_id', d.doc_id, 'industry_name', d.industry_name,
        'status', c.status, 'row_count', c.row_count
      ) order by c.updated_at desc, d.doc_id)
      from public.practice_collections c
      join public.documents d on d.doc_id = c.doc_id
      where c.analyst_name = v_name
    ), '[]'::jsonb));
  end if;
  if p_action is null or p_action not in ('claim', 'load', 'save') then
    raise exception 'Unknown practice action';
  end if;

  select * into v_doc from public.documents where doc_id = v_id;
  if not found then raise exception 'No source document found for that document ID'; end if;
  v_document := (to_jsonb(v_doc) - 'assigned_analyst' - 'researcher')
    || jsonb_build_object('Production Status', v_doc.production_status,
                          'Ground Truth Status', v_doc.ground_truth_status);

  if p_action = 'claim' then
    insert into public.practice_collections (analyst_name, doc_id)
    values (v_name, v_doc.doc_id)
    on conflict (analyst_name, doc_id) do nothing;
    return jsonb_build_object('doc_id', v_doc.doc_id);
  end if;

  if p_action = 'load' then
    select * into v_record from public.practice_collections
    where analyst_name = v_name and doc_id = v_doc.doc_id;
    if not found then raise exception 'Add this document to your practice queue first'; end if;
    return jsonb_build_object('document', v_document, 'record', jsonb_build_object(
      'context', jsonb_build_object('market_tier', v_doc.market_tier) || v_record.context_json,
      'rows', v_record.rows_json, 'status', v_record.status, 'revision', v_record.revision,
      'updated', v_record.updated_at, 'completed', v_record.completed_at, 'audited', v_record.audited_at
    ));
  end if;

  v_revision := (p_payload->>'revision')::integer;
  v_status := p_payload->>'status';
  if v_revision is null or v_revision < 0 or v_status is null then
    raise exception 'Invalid practice collection payload';
  end if;
  update public.practice_collections
  set context_json = p_payload->'context', rows_json = p_payload->'rows',
      status = v_status, revision = revision + 1, updated_at = now(),
      completed_at = case when v_status in ('completed', 'audited') then coalesce(completed_at, now()) end,
      audited_at = case when v_status = 'audited' then now() end
  where analyst_name = v_name and doc_id = v_doc.doc_id and revision = v_revision
  returning * into v_record;
  if not found then
    return jsonb_build_object('error', 'Practice copy changed or is missing. Reload your copy.', 'conflict', true);
  end if;
  return jsonb_build_object('revision', v_record.revision, 'updated', v_record.updated_at);
end
$$;

revoke all on function public.practice_api(text, jsonb) from public, anon, authenticated;
grant execute on function public.practice_api(text, jsonb) to anon;
