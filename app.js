const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const app = express();

// إعداد multer لتخزين الصور مؤقتًا
const upload = multer({ dest: "uploads/" });

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
    throw new Error(`Failed to remove background: ${error.message}`);
  }
}

// نقطة النهاية لمعالجة الصور
app.post(
  "/merge-images",
  upload.fields([
    { name: "user_image", maxCount: 1 },
    { name: "background_image", maxCount: 1 },
  ]),
  async (req, res) => {
    if (!req.files || !req.files["user_image"] || !req.files["background_image"]) {
      return res.status(400).send("يرجى رفع الصور المطلوبة.");
    }

    const userImagePath = req.files["user_image"][0].path;
    const backgroundImagePath = req.files["background_image"][0].path;

    try {
      // إزالة الخلفية من صورة المستخدم
      const userImageNoBgBuffer = await removeBackground(userImagePath);

      // حفظ الصورة بدون خلفية مؤقتًا
      const userImageNoBgPath = `uploads/user_no_bg.png`;
      fs.writeFileSync(userImageNoBgPath, userImageNoBgBuffer);

      // الحصول على أبعاد صورة الخلفية
      const backgroundMetadata = await sharp(backgroundImagePath).metadata();
      const { width, height } = backgroundMetadata;

      // تقليص حجم صورة المستخدم إلى 30% من حجم الخلفية
      const resizedUserImagePath = `uploads/user_resized.png`;
      await sharp(userImageNoBgPath)
        .resize(Math.floor(width * 0.6), Math.floor(height * 0.7)) // تقليص الحجم بنسبة 30%
        .toFile(resizedUserImagePath);

      // تقليل حجم الصورة النهائية (تقليص الجودة) عند دمجها
      const outputPath = `uploads/final_image.jpg`;  // تحويل إلى JPEG
      await sharp(backgroundImagePath)
        .composite([{
          input: resizedUserImagePath,
          gravity: "center", // التأكد من أن صورة المستخدم في المنتصف
        }])
        .jpeg({ quality: 80 })  // تقليل الجودة إلى 80% لتقليص الحجم
        .toFile(outputPath);

      // إرسال الصورة النهائية
      res.sendFile(outputPath, { root: __dirname });

      // حذف الصورة النهائية بعد الإرسال
      setTimeout(() => {
        fs.unlinkSync(outputPath);
        console.log("تم حذف الصورة النهائية المؤقتة.");
      }, 5000); // حذف الصورة بعد 5 ثوانٍ
    } catch (error) {
      console.error("Error processing images:", error.message);
      res.status(500).send(`حدث خطأ أثناء معالجة الصور: ${error.message}`);
    } finally {
      // حذف الصور المؤقتة
      try {
        fs.unlinkSync(userImagePath);
        fs.unlinkSync(backgroundImagePath);
        console.log("تم حذف الصور المؤقتة.");
      } catch (error) {
        console.error("Failed to delete temporary files:", error.message);
      }
    }
  }
);

// بدء تشغيل السيرفر
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
