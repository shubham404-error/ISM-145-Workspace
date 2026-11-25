do $migration$
declare
  f text := pg_catalog.pg_get_functiondef('public.code_api(text,jsonb)'::regprocedure);
begin
  if strpos(f,$anchor$ if p_action='self-assign' then$anchor$)=0
     or strpos(f,$anchor$  if exists(select 1 from public.collections where doc_id=v_id) then$anchor$)=0 then
    raise exception 'Expected document claim handler';
  end if;
  f := replace(f,$anchor$ if p_action='self-assign' then$anchor$,$patch$ if p_action='document-sample' then
  return jsonb_build_object('documents',coalesce((
   select jsonb_agg(jsonb_build_object(
     'doc_id',d.doc_id,'company_id',d.company_id,'company_name',d.company_name,
     'industry_name',d.industry_name,'form_type',d.form_type,'market',d.market,
     'assigned_to_me',d.assigned_analyst is not distinct from v_name,
     'collection_status',case when d.assigned_analyst=v_name then
       coalesce(u.content->>'status',c.status,'in progress') else 'Available' end
   ) order by d.company_name,d.doc_id)
   from public.documents d
   left join public.collections c on c.doc_id=d.doc_id
   left join public.collection_views u on u.doc_id=d.doc_id and u.scope='production' and u.owner_name='' and u.view_name='udcp'
   where d.assigned_analyst=v_name
      or (coalesce(trim(d.assigned_analyst),'')='' and c.doc_id is null and coalesce(u.revision,0)=0)
  ),'[]'::jsonb));
 end if;
 if p_action='self-assign' then$patch$);
  f := replace(f,$anchor$  if exists(select 1 from public.collections where doc_id=v_id) then$anchor$,$patch$  if exists(select 1 from public.collections where doc_id=v_id)
     or exists(select 1 from public.collection_views where doc_id=v_id and scope='production' and owner_name='' and view_name='udcp' and revision>0) then$patch$);
  execute f;
end
$migration$;
