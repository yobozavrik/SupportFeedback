const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { Readable } = require('stream');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const requiredEnvVars = [
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'GOOGLE_DRIVE_FOLDER_ID',
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
let driveClient = null;

if (missingEnvVars.length > 0) {
  console.warn(
    `Google Drive integration is not fully configured. Missing environment variables: ${missingEnvVars.join(
      ', '
    )}`
  );
} else {
  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/drive']
    );

    driveClient = google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error('Failed to initialize Google Drive client:', error);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/upload/google-drive', upload.single('file'), async (req, res) => {
  if (!driveClient) {
    return res.status(500).json({ error: 'Google Drive клієнт не налаштований на сервері.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Файл не було надіслано.' });
  }

  if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
    return res.status(400).json({ error: 'Дозволено завантажувати лише зображення.' });
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  try {
    const fileName = `${Date.now()}-${req.file.originalname}`;
    const bufferStream = Readable.from(req.file.buffer);

    const { data: createdFile } = await driveClient.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: req.file.mimetype,
        body: bufferStream,
      },
      fields: 'id',
    });

    await driveClient.permissions.create({
      fileId: createdFile.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    const { data: driveFile } = await driveClient.files.get({
      fileId: createdFile.id,
      fields: 'webViewLink, webContentLink',
    });

    return res.status(201).json({
      fileId: createdFile.id,
      webViewLink: driveFile.webViewLink,
      webContentLink: driveFile.webContentLink,
    });
  } catch (error) {
    console.error('Failed to upload file to Google Drive:', error);
    return res.status(500).json({
      error: 'Не вдалося завантажити файл у Google Drive. Перевірте налаштування сервісного акаунта.',
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SupportFeedback server listening on port ${PORT}`);
});
