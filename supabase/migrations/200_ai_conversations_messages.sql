-- Persistent Site-Bolt AI chat (user-isolated via RLS).
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_updated_idx
  ON public.ai_conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_created_idx
  ON public.ai_messages (conversation_id, created_at ASC);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_conversations_select_own ON public.ai_conversations;
CREATE POLICY ai_conversations_select_own
  ON public.ai_conversations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_conversations_insert_own ON public.ai_conversations;
CREATE POLICY ai_conversations_insert_own
  ON public.ai_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_conversations_update_own ON public.ai_conversations;
CREATE POLICY ai_conversations_update_own
  ON public.ai_conversations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_conversations_delete_own ON public.ai_conversations;
CREATE POLICY ai_conversations_delete_own
  ON public.ai_conversations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_messages_select_own ON public.ai_messages;
CREATE POLICY ai_messages_select_own
  ON public.ai_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_messages_insert_own ON public.ai_messages;
CREATE POLICY ai_messages_insert_own
  ON public.ai_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_messages_delete_own ON public.ai_messages;
CREATE POLICY ai_messages_delete_own
  ON public.ai_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
