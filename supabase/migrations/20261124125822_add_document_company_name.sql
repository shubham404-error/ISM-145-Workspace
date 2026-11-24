alter table public.documents add column company_name text not null default '';
do $migration$
declare
 w text := pg_get_functiondef('public.workspace_api(text,jsonb)'::regprocedure);
 u text := pg_get_functiondef('public.udcp_api(text,jsonb)'::regprocedure);
begin
 if strpos(w,'insert into public.documents(doc_id,company_id,industry_name')=0
 or strpos(w,$s$values(v_id,trim(v_row->>'company_id'),coalesce$s$)=0
 or strpos(u,$s$'company_id',v_doc.company_id$s$)=0 then
   raise exception 'Expected import or UDCP SQL definition changed';
 end if;
 w := replace(w,'insert into public.documents(doc_id,company_id,industry_name','insert into public.documents(doc_id,company_id,company_name,industry_name');
 w := replace(w,$s$values(v_id,trim(v_row->>'company_id'),coalesce$s$,$s$values(v_id,trim(v_row->>'company_id'),coalesce(trim(v_row->>'company_name'),''),coalesce$s$);
 execute w;
 execute replace(u,$s$'company_id',v_doc.company_id$s$,$s$'company_id',v_doc.company_id,'company_name',v_doc.company_name$s$);
end
$migration$;
