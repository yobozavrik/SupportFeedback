const path = require('path');
const express = require('express');
const ImageKit = require('imagekit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const getImageKitInstance = () => {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('ImageKit private key is not configured');
  }

  return new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
    privateKey,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || ''
  });
};

app.post('/auth/imagekit', (req, res) => {
  try {
    const imagekit = getImageKitInstance();
    const authParams = imagekit.getAuthenticationParameters();
    res.json(authParams);
  } catch (error) {
    console.error('ImageKit auth error:', error);
    res.status(500).json({ error: 'Unable to generate ImageKit authentication parameters' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
