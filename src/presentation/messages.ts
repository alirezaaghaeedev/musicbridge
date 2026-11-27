export const messages = {
  en: {
    welcome:
      "Welcome to MusicBridge. 1. /connect Spotify 2. /playlist choose a destination 3. /settings 4. Send audio, or use /search Title | Artist.",
    help: "/start /help /connect /disconnect /settings /playlist /history /pending /stats /cancel\n/search Title | Artist\n/playlist URL, URI or ID\n/threshold 80 · /auto on|off · /duplicates on|off · /language fa|en\nUse review buttons to edit metadata, retry or cancel.",
    connect: "Open Spotify authorization, then confirm the account here.",
    confirm: "Confirm linking this Spotify account:",
    connected: "Spotify connected. Select /playlist.",
    disconnected:
      "Connection removed. Revoke MusicBridge in your Spotify account applications to revoke provider access.",
    playlist:
      "Select a playlist you own, or send /playlist followed by its URL, URI or ID.",
    saved: "Saved.",
    metadata:
      "Send the title and artist: Title | Artist. This will replace extracted metadata.",
    enterTitle: "Send the corrected title only.",
    enterArtist: "Send the corrected artist only.",
    review: "Choose one candidate. Scores measure similarity, not probability.",
    none: "No confident match. Edit the metadata or search again.",
    setup:
      "Connect Spotify with /connect and configure /playlist, then retry this submission.",
    added: "✅ Track added",
    quota:
      "Spotify developer-account quota is exhausted. Automatic retries stopped. Wait for a reset or review app usage, then retry explicitly from /history.",
    unavailable:
      "Spotify explicitly reports this track unavailable for this account. No track was added. Choose another recording.",
    availabilityUnknown:
      "Spotify did not confirm availability. No track was added. Open it in Spotify and search again after provider verification.",
    limited:
      "Matching reached its computation limit. Automatic addition is blocked. Review the candidates or shorten/correct the metadata.",
    duplicate: "This track already exists in the playlist.",
    cancel: "Cancelled.",
    expired:
      "This action expired, was already used, or belongs to another user.",
    failed:
      "Processing failed. Retry from /history; permissions or quota may require action.",
    reauth:
      "Spotify authorization expired. Use /connect, then retry from /history.",
    uncertain:
      "The playlist outcome needs reconciliation. No blind retry will be sent. Use retry to check playlist state.",
    empty: "No records.",
    denied: "Access denied.",
    choose: "Choose",
    more: "More",
    title: "Edit title",
    artist: "Edit artist",
    retry: "Search / retry",
    cancelButton: "Cancel",
    settings: "Settings",
    auto: "Automatic addition",
    duplicates: "Prevent duplicates",
    language: "Language",
    threshold: "Threshold",
    statistics: [
      "Processed submissions",
      "Automatic additions",
      "Manual additions",
      "Duplicates",
      "Pending review",
      "Failed",
      "Unmatched",
    ],
  },
  fa: {
    welcome:
      "به MusicBridge خوش آمدید. ۱. /connect اتصال اسپاتیفای ۲. /playlist انتخاب پلی‌لیست ۳. /settings تنظیمات ۴. فایل موسیقی بفرستید یا /search عنوان | هنرمند",
    help: "/start /help /connect /disconnect /settings /playlist /history /pending /stats /cancel\n/search عنوان | هنرمند\n/playlist آدرس یا شناسه\n/threshold 80 · /auto on|off · /duplicates on|off · /language fa|en\nبرای ویرایش، تلاش مجدد یا لغو از دکمه‌ها استفاده کنید.",
    connect: "لینک اتصال اسپاتیفای را باز کنید و سپس حساب را اینجا تأیید کنید.",
    confirm: "اتصال این حساب اسپاتیفای را تأیید می‌کنید؟",
    connected: "اسپاتیفای متصل شد. با /playlist مقصد را انتخاب کنید.",
    disconnected:
      "اتصال حذف شد. برای لغو دسترسی، MusicBridge را از برنامه‌های حساب اسپاتیفای حذف کنید.",
    playlist:
      "پلی‌لیستی که مالک آن هستید انتخاب کنید یا /playlist و آدرس یا شناسه آن را بفرستید.",
    saved: "ذخیره شد.",
    metadata:
      "عنوان و هنرمند را به این شکل بفرستید: عنوان | هنرمند. اطلاعات جدید جایگزین قبلی می‌شود.",
    enterTitle: "فقط عنوان صحیح آهنگ را بفرستید.",
    enterArtist: "فقط نام صحیح هنرمند را بفرستید.",
    review: "یک گزینه انتخاب کنید. امتیاز میزان شباهت است، نه احتمال صحت.",
    none: "تطابق مطمئنی یافت نشد. اطلاعات را ویرایش کنید یا دوباره جستجو کنید.",
    setup: "ابتدا /connect و /playlist را تنظیم کنید، سپس دوباره تلاش کنید.",
    added: "✅ آهنگ اضافه شد",
    quota:
      "سهمیه حساب توسعه‌دهنده اسپاتیفای تمام شده است. تلاش خودکار متوقف شد. پس از بازنشانی سهمیه یا بررسی مصرف، از /history دوباره تلاش کنید.",
    unavailable:
      "اسپاتیفای این آهنگ را برای حساب شما در دسترس اعلام نکرده است. آهنگی اضافه نشد؛ نسخه دیگری انتخاب کنید.",
    availabilityUnknown:
      "اسپاتیفای دسترسی آهنگ را تأیید نکرده است. آهنگی اضافه نشد. در اسپاتیفای بررسی و پس از تأیید دوباره جستجو کنید.",
    limited:
      "تطبیق به سقف محاسبات رسید. افزودن خودکار متوقف است؛ گزینه‌ها را بررسی یا اطلاعات را کوتاه و اصلاح کنید.",
    duplicate: "این آهنگ از قبل در پلی‌لیست وجود دارد.",
    cancel: "لغو شد.",
    expired: "این دکمه منقضی شده، قبلاً استفاده شده یا متعلق به شما نیست.",
    failed:
      "پردازش ناموفق بود. از /history دوباره تلاش کنید؛ مجوز یا سهمیه را بررسی کنید.",
    reauth: "دسترسی اسپاتیفای منقضی شده. /connect و سپس تلاش مجدد از /history.",
    uncertain:
      "نتیجه افزودن نامشخص است. افزودن دوباره انجام نمی‌شود. تلاش مجدد فقط وضعیت پلی‌لیست را بررسی می‌کند.",
    empty: "موردی نیست.",
    denied: "دسترسی مجاز نیست.",
    choose: "انتخاب",
    more: "بیشتر",
    title: "ویرایش عنوان",
    artist: "ویرایش هنرمند",
    retry: "جستجو / تلاش مجدد",
    cancelButton: "لغو",
    settings: "تنظیمات",
    auto: "افزودن خودکار",
    duplicates: "جلوگیری از تکرار",
    language: "زبان",
    threshold: "آستانه",
    statistics: [
      "درخواست‌های پردازش‌شده",
      "افزودن خودکار",
      "افزودن دستی",
      "تکراری",
      "در انتظار بررسی",
      "ناموفق",
      "بدون تطابق",
    ],
  },
} as const;
