#!/usr/bin/env bash
# ==============================================================================
# MEHLA LEGAL PLATFORM — ORCA SAUDI CLOUD AUTOMATED DEPLOYMENT SCRIPT
# سكريبت النشر والتشغيل الآلي لمنصة مِهلة على سيرفر أوركا السعودي
# ==============================================================================

set -e

echo "================================================================================"
echo "           🚀 MEHLA LEGAL PLATFORM — DEPLOYING TO ORCA SAUDI CLOUD               "
echo "================================================================================"

# 1. فحص وجود Docker و Docker Compose
if ! command -v docker &> /dev/null; then
    echo "📦 Docker غير مثبت. جاري التثبيت التلقائي..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
fi

if ! docker compose version &> /dev/null; then
    echo "📦 جاري تثبيت Docker Compose Plugin..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

# 2. فحص ملف البيئة .env
if [ ! -f .env ]; then
    echo "⚠️ لم يتم العثور على ملف .env!"
    if [ -f .env.production.example ]; then
        echo "📋 جاري إنشاء ملف .env من النموذج الأولي..."
        cp .env.production.example .env
        echo "⚠️ يرجى تعديل القيم في ملف .env قبل إعادة تشغيل السكريبت."
        exit 1
    else
        echo "❌ خطأ: ملف .env مفقود."
        exit 1
    fi
fi

# 3. إنشاء المجلدات المطلوبة للشهادات والسجلات
mkdir -p nginx/ssl nginx/certbot/conf nginx/certbot/www

# 4. بناء وتشغيل الحاويات في الخلفية
echo "🔨 جاري بناء وتشغيل حاويات منصة مِهلة (TanStack Start SSR + Nginx)..."
docker compose down --remove-orphans || true
docker compose build --no-cache
docker compose up -d

# 5. التحقق من صحة تشغيل الخادم محلياً
echo "⏳ جاري فحص استجابة الخادم..."
sleep 5

if docker ps | grep -q "mehla_app"; then
    echo "✅ حاوية التطبيق (mehla_app) تعمل بنجاح!"
else
    echo "❌ خطأ: حاوية التطبيق لم تبدأ. فحص السجلات:"
    docker compose logs mehla_app
    exit 1
fi

echo "================================================================================"
echo "  🎉 تم نشر منصة مِهلة القانونية بنجاح على سيرفر أوركا السعودي!"
echo "  🌐 المنصة تعمل الآن وتستقبل الطلبات عبر المنفذ 80 و 443"
echo "================================================================================"
