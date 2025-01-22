const express = require("express");
const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

const app = express();
app.use(express.json());
const cors = require('cors');

// تفعيل CORS لجميع المجالات (يمكنك تحديد نطاقات معينة بدلاً من *)
app.use(cors());

// أو يمكنك تخصيص الإعدادات كما يلي:
app.use(cors({
  origin: '*',  // يسمح لجميع المواقع
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


// إنشاء مجلد "uploads" إذا لم يكن موجودًا
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// دالة لتنزيل الصورة من الرابط
async function downloadImage(url, outputPath) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

// دالة لإزالة الخلفية باستخدام API remove.bg
async function removeBackground(imagePath) {
  const apiKey = "rXknvThzmXNTJBr6tjbp5Sh9"; // استبدل YOUR_API_KEY بمفتاح API الخاص بك
  const url = "https://api.remove.bg/v1.0/removebg";

  const formData = new FormData();
  formData.append("image_file", fs.createReadStream(imagePath));
  formData.append("size", "auto");

  try {
    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
        "X-Api-Key": apiKey,
      },
      responseType: "arraybuffer",
    });
    return response.data; // الصورة بدون خلفية
  } catch (error) {
    throw new Error(
      `Failed to remove background: ${error.response?.data || error.message}`
    );
  }
}

// نقطة النهاية لمعالجة الصور
app.post("/merge-images", async (req, res) => {
  const { userImageUrl, backgroundImageUrl } = req.body;

  if (!userImageUrl || !backgroundImageUrl) {
    return res.status(400).send("يرجى تقديم روابط الصور المطلوبة.");
  }

  const userImagePath = path.join(uploadDir, "user_image.png");
  const backgroundImagePath = path.join(uploadDir, "background_image.png");

  try {
    // تنزيل الصور من الروابط
    await downloadImage(userImageUrl, userImagePath);
    await downloadImage(backgroundImageUrl, backgroundImagePath);

    // إزالة الخلفية من صورة المستخدم
    const userImageNoBgBuffer = await removeBackground(userImagePath);

    // حفظ الصورة بدون خلفية مؤقتًا
    const userImageNoBgPath = path.join(uploadDir, "user_no_bg.png");
    fs.writeFileSync(userImageNoBgPath, userImageNoBgBuffer);

    // الحصول على أبعاد صورة الخلفية
    const backgroundMetadata = await sharp(backgroundImagePath).metadata();
    const { width, height } = backgroundMetadata;

    // تقليص حجم صورة المستخدم
    const resizedUserImagePath = path.join(uploadDir, "user_resized.png");
    await sharp(userImageNoBgPath)
      .resize(Math.floor(width * 0.6), Math.floor(height * 0.7))
      .toFile(resizedUserImagePath);

    // دمج الصور
    const outputPath = path.join(uploadDir, "final_image.jpg");
    await sharp(backgroundImagePath)
      .composite([{ input: resizedUserImagePath, gravity: "center" }])
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    // حفظ الصورة النهائية في مجلد ثابت
    const finalImageUrl = `http://localhost:3000/uploads/final_image.jpg`;

    // إرسال رابط الصورة النهائية
    res.json({ imageUrl: finalImageUrl });
  } catch (error) {
    console.error("Error processing images:", error.message);
    res.status(500).send(`حدث خطأ أثناء معالجة الصور: ${error.message}`);
  } finally {
    // حذف الصور المؤقتة
    const filesToDelete = [
      userImagePath,
      backgroundImagePath,
      path.join(uploadDir, "user_no_bg.png"),
      path.join(uploadDir, "user_resized.png"),
    ];

    filesToDelete.forEach((file) => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        console.error(`Failed to delete file ${file}:`, error.message);
      }
    });
  }
});

// تقديم الملفات من مجلد "uploads"
app.use("/uploads", express.static(uploadDir));

// بدء تشغيل السيرفر
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
