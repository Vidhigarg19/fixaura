CREATE TABLE public.repair_step_progress (
  repair_session_id uuid NOT NULL
    REFERENCES public.repair_sessions (id) ON DELETE CASCADE,
  step_id text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repair_step_progress_pkey
    PRIMARY KEY (repair_session_id, step_id)
);

ALTER TABLE public.repair_step_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own repair step progress"
ON public.repair_step_progress
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.repair_sessions AS rs
    WHERE rs.id = repair_step_progress.repair_session_id
      AND rs.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.repair_sessions AS rs
    WHERE rs.id = repair_step_progress.repair_session_id
      AND rs.user_id = (SELECT auth.uid())
  )
);

GRANT SELECT, INSERT, UPDATE
ON TABLE public.repair_step_progress
TO authenticated;