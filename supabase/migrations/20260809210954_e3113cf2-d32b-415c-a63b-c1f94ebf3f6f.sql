ALTER TABLE public.organizations DROP CONSTRAINT organizations_created_by_fkey,
  ADD CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.organization_invitations DROP CONSTRAINT organization_invitations_invited_by_fkey,
  ADD CONSTRAINT organization_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.clients DROP CONSTRAINT clients_created_by_fkey,
  ADD CONSTRAINT clients_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.cases DROP CONSTRAINT cases_assigned_lawyer_id_fkey,
  ADD CONSTRAINT cases_assigned_lawyer_id_fkey FOREIGN KEY (assigned_lawyer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.cases DROP CONSTRAINT cases_created_by_fkey,
  ADD CONSTRAINT cases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.hearings DROP CONSTRAINT hearings_created_by_fkey,
  ADD CONSTRAINT hearings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.deadlines DROP CONSTRAINT deadlines_responsible_user_id_fkey,
  ADD CONSTRAINT deadlines_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.deadlines DROP CONSTRAINT deadlines_created_by_fkey,
  ADD CONSTRAINT deadlines_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tasks DROP CONSTRAINT tasks_assigned_to_fkey,
  ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tasks DROP CONSTRAINT tasks_created_by_fkey,
  ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.case_updates DROP CONSTRAINT case_updates_created_by_fkey,
  ADD CONSTRAINT case_updates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.documents DROP CONSTRAINT documents_uploaded_by_fkey,
  ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.activity_logs DROP CONSTRAINT activity_logs_user_id_fkey,
  ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;