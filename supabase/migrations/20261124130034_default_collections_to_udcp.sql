do $migration$
declare f text := pg_get_functiondef('public.udcp_api(text,jsonb)'::regprocedure);
begin
 if strpos(f,$old$if p_action='choose' then$old$)=0 then raise exception 'Expected UDCP choice handler'; end if;
 f:=replace(f,$old$if p_action='choose' then$old$,$new$if p_action='choose' then
    v_choice := 'udcp';
    update public.collection_views set view_name='udcp'
    where scope=v_scope and owner_name=v_owner and doc_id=v_id and view_name='gt';$new$);
 execute f;
end
$migration$;