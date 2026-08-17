-- ==============================================================================
-- MEHLA LEGAL PLATFORM — BAYAN LEGAL AI COPILOT MIGRATION
-- المحامية الذكية «بيان» — محادثات واستشارات القضايا المستقلة والمعزولة بالكامل
-- ==============================================================================

-- 1. جدول محادثات القضايا الذكية
CREATE TABLE IF NOT EXISTS public.case_ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'استشارة مع المحامية بيان',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. جدول رسائل واستشارات المحامية بيان
CREATE TABLE IF NOT EXISTS public.case_ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.case_ai_conversations(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. الفهارس لتحقيق أعلى سرعة استجابة
CREATE INDEX IF NOT EXISTS idx_case_ai_conv_case ON public.case_ai_conversations(case_id);
CREATE INDEX IF NOT EXISTS idx_case_ai_conv_org ON public.case_ai_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_case_ai_msg_conv ON public.case_ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_case_ai_msg_case ON public.case_ai_messages(case_id);

-- 4. تفعيل سياسات الأمان والعزل على مستوى الصف (RLS)
ALTER TABLE public.case_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_ai_messages ENABLE ROW LEVEL SECURITY;

-- سياسة الوصول لمحادثات القضايا (فقط أعضاء المكتب النشطين)
CREATE POLICY "org_members_access_case_ai_conversations"
ON public.case_ai_conversations
FOR ALL
TO authenticated
USING (
    organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.user_id = auth.uid() 
          AND om.status = 'active'
    )
)
WITH CHECK (
    organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.user_id = auth.uid() 
          AND om.status = 'active'
    )
);

-- سياسة الوصول لرسائل المحامية بيان
CREATE POLICY "org_members_access_case_ai_messages"
ON public.case_ai_messages
FOR ALL
TO authenticated
USING (
    organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.user_id = auth.uid() 
          AND om.status = 'active'
    )
)
WITH CHECK (
    organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.user_id = auth.uid() 
          AND om.status = 'active'
    )
);

-- منح الصلاحيات للأدوار المعتمدة
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_ai_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_ai_messages TO authenticated;
