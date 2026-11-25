do $migration$
declare
  udcp text := pg_catalog.pg_get_functiondef('public.udcp_api(text,jsonb)'::regprocedure);
  practice text := pg_catalog.pg_get_functiondef('public.practice_api(text,jsonb)'::regprocedure);
  code text := pg_catalog.pg_get_functiondef('public.code_api(text,jsonb)'::regprocedure);
begin
  if strpos(udcp, $old$    for v_period in select value from jsonb_array_elements(v_content->'periods') loop$old$)=0
    or strpos(practice, $old$'status', c.status, 'row_count', c.row_count$old$)=0
    or strpos(code, $old$'collection_status',coalesce(c.status,'in progress'),'row_count',coalesce(c.row_count,0)$old$)=0 then
    raise exception 'Expected collection API definitions';
  end if;

  udcp := replace(udcp, $old$    for v_period in select value from jsonb_array_elements(v_content->'periods') loop$old$, $new$    if v_content ? 'status' and coalesce(v_content->>'status','') not in ('in progress','completed','junk') then
      raise exception 'Invalid collection status';
    end if;
    if not (v_content ? 'status') and v_record.content ? 'status' then
      v_content := v_content || jsonb_build_object('status',v_record.content->>'status');
    end if;
    for v_period in select value from jsonb_array_elements(v_content->'periods')
      where (v_content->>'status') is distinct from 'junk' loop$new$);
  execute udcp;

  practice := replace(practice, $old$'status', c.status, 'row_count', c.row_count$old$,
    $new$'status', coalesce(u.content->>'status', c.status),
        'row_count', case when u.revision > 0 then jsonb_array_length(u.content->'metrics') else c.row_count end$new$);
  practice := replace(practice, $old$      where c.analyst_name = v_name$old$,
    $new$      left join public.collection_views u
        on u.scope='practice' and u.owner_name=c.analyst_name and u.doc_id=c.doc_id and u.view_name='udcp'
      where c.analyst_name = v_name$new$);
  execute practice;

  code := replace(code, $old$'collection_status',coalesce(c.status,'in progress'),'row_count',coalesce(c.row_count,0)$old$,
    $new$'collection_status',coalesce(u.content->>'status',c.status,'in progress'),
      'row_count',case when u.revision > 0 then jsonb_array_length(u.content->'metrics') else coalesce(c.row_count,0) end$new$);
  code := replace(code, $old$from public.documents d left join public.collections c on c.doc_id=d.doc_id$old$,
    $new$from public.documents d left join public.collections c on c.doc_id=d.doc_id
    left join public.collection_views u
      on u.scope='production' and u.owner_name='' and u.doc_id=d.doc_id and u.view_name='udcp'$new$);
  execute code;
end
$migration$;
