require('dotenv').config();

const express = require('express');
const path = require('path');
const ImageKit = require('imagekit');

const app = express();
const port = process.env.PORT || 3000;

const hasImageKitConfig = Boolean(
  process.env.IMAGEKIT_PUBLIC_KEY &&
  process.env.IMAGEKIT_PRIVATE_KEY &&
  process.env.IMAGEKIT_URL_ENDPOINT
);

if (!hasImageKitConfig) {
  console.warn('ImageKit configuration is missing. /auth/imagekit endpoint will be disabled.');
}

const imagekit = hasImageKitConfig
  ? new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    })
  : null;

app.get('/auth/imagekit', (req, res) => {
  if (!imagekit) {
    return res.status(500).json({ error: 'ImageKit is not configured on the server.' });
  }

  try {
    const authParams = imagekit.getAuthenticationParameters();
    res.json(authParams);
  } catch (error) {
    console.error('Failed to generate ImageKit auth parameters:', error);
    res.status(500).json({ error: 'Unable to generate ImageKit authentication data.' });
  }
});

app.use(express.static(path.join(__dirname)));

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
