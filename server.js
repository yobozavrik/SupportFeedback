import express from 'express';
import dotenv from 'dotenv';
import ImageKit from 'imagekit';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const REQUIRED_ENV_VARS = [
  'IMAGEKIT_PUBLIC_KEY',
  'IMAGEKIT_PRIVATE_KEY',
  'IMAGEKIT_URL_ENDPOINT',
];

const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingVars.length > 0) {
  console.warn(
    `Missing ImageKit environment variables: ${missingVars.join(', ')}. The authentication endpoint may not function correctly.`,
  );
}

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || '',
});

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));

app.get('/imagekit-auth', (req, res) => {
  try {
    if (!process.env.IMAGEKIT_PRIVATE_KEY) {
      return res.status(500).json({ error: 'ImageKit private key is not configured.' });
    }

    const authParameters = imagekit.getAuthenticationParameters();
    return res.json(authParameters);
  } catch (error) {
    console.error('Failed to generate ImageKit authentication parameters:', error);
    return res
      .status(500)
      .json({ error: 'Failed to generate ImageKit authentication parameters.' });
  }
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export default app;
