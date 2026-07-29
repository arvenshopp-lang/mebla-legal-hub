ALTER TABLE public.document_requests
  ADD CONSTRAINT document_requests_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;