# 🇸🇦 دليل النشر الشامل لمنصة مِهلة القانونية على سيرفر أوركا السعودي (Orca Cloud KSA)

---

## 🌟 نظرة عامة
تم تجهيز وتأمين منصة **مِهلة** لتكون منصة سحابية قانونية مستقلة 100% (SaaS) وقابلة للنشر مباشرة على السيرفرات السحابية الوطنية المعتمدة بالمملكة العربية السعودية (مثل **أوركا السحابية - Orca Cloud**) بما يحقق التوافق التام مع:
* ضوابط الهيئة الوطنية للأمن السيبراني (**NCA ECC / CCC**).
* نظام حماية البيانات الشخصية السعودي (**PDPL**).
* متطلبات استضافة البيانات القانونية والسيادة الرقمية داخل المملكة.

---

## 📋 المتطلبات الفنية الأساسية للسيرفر (Orca VPS Specs)

| المكون | المواصفات الموصى بها (Recommended) | الحد الأدنى (Minimum) |
| :--- | :--- | :--- |
| **نظام التشغيل** | Ubuntu 24.04 LTS / 22.04 LTS (x86_64) | Ubuntu 22.04 LTS |
| **المعالج (CPU)** | 4 vCPU | 2 vCPU |
| **الذاكرة العشوائية (RAM)** | 8 GB RAM | 4 GB RAM |
| **التخزين (Storage)** | 80 GB NVMe SSD | 40 GB SSD |
| **الموقع الجغرافي** | مركز بيانات الرياض / جدة | المملكة العربية السعودية |

---

## 🚀 خطوات النشر على سيرفر أوركا (في 4 خطوات بسيطة)

### الخطوة 1: الدخول إلى السيرفر وتنزيل المستودع
اتصل بسيرفر أوركا عبر الـ SSH:
```bash
ssh root@<ORCA_SERVER_IP>
```

استنسخ مستودع المشروع:
```bash
git clone https://github.com/arvenshopp-lang/mebla-legal-hub.git /var/www/mehla
cd /var/www/mehla
```

---

### الخطوة 2: إنشاء وضبط ملف البيئة (`.env`)
انسخ نموذج الإعدادات الجاهز:
```bash
cp .env.production.example .env
nano .env
```
تأكد من كتابة القيم الحقيقية لـ:
* `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY`
* `SUPABASE_SERVICE_ROLE_KEY`
* `RESEND_API_KEY` (`re_Vj9RuonX_53vKPRK1aP892LbFuJ5M56pj`)
* `CRON_SECRET`

---

### الخطوة 3: التشغيل التلقائي عبر السكريبت الجاهز
قم بإعطاء صلاحية التنفيذ للسكريبت وشغّله:
```bash
chmod +x deploy-orca.sh
./deploy-orca.sh
```
يقوم السكريبت تلقائياً بـ:
1. تثبيت وتحديث Docker و Docker Compose.
2. بناء صورة الإنتاج المصغرة والمحمية (Non-root user).
3. تشغيل خادم مِهلة SSR وخادم البروكسي العكسي Nginx.

---

### الخطوة 4: توجيه النطاق (DNS) وإصدار شهادة SSL المجانية

1. في لوحة تحكم النطاق `mehlalex.com` (Cloudflare / Namecheap / GoDaddy)، أضف السجلات التالية:
   * **نوع `A`:** `@` $\rightarrow$ `<ORCA_SERVER_IP>`
   * **نوع `CNAME`:** `www` $\rightarrow$ `mehlalex.com`

2. إصدار شهادة Let's Encrypt التلقائية بضغطة زر:
```bash
sudo apt-get install -y certbot
sudo certbot certonly --webroot -w /var/www/mehla/nginx/certbot/www -d mehlalex.com -d www.mehlalex.com --agree-tos -m support@mehlalex.com --non-interactive
docker compose restart mehla_proxy
```

---

## 🛠️ أوامر الصيانة والمتابعة الدورية

* **عرض حالة الحاويات:**
  ```bash
  docker compose ps
  ```
* **متابعة سجلات التطبيق اللحظية (Live Logs):**
  ```bash
  docker compose logs -f mehla_app
  ```
* **تحديث المنصة بآخر التعديلات من GitHub:**
  ```bash
  git pull origin main
  ./deploy-orca.sh
  ```
* **إعادة تشغيل المنصة:**
  ```bash
  docker compose restart
  ```
