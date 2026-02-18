const FormData = require('form-data');
const axios = require('axios');

// ... (Fungsi helper genserial, upimage, uploadtoOSS, createJob sama seperti sebelumnya) ...

function genserial() {
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

async function upimage(filename) {
  const form = new FormData();
  form.append('file_name', filename);
  const res = await axios.post('https://api.imgupscaler.ai/api/common/upload/upload-image', form, {
    headers: { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36', origin: 'https://imgupscaler.ai', referer: 'https://imgupscaler.ai/' }
  });
  return res.data.result;
}

async function uploadtoOSS(putUrl, imageBuffer, mimetype) {
  const res = await axios.put(putUrl, imageBuffer, {
    headers: { 'Content-Type': mimetype }, maxBodyLength: Infinity, maxContentLength: Infinity
  });
  return res.status === 200;
}

async function createJob(imgurl, originalteks, replacetext) {
  const form = new FormData();
  form.append('original_image_url', imgurl);
  form.append('original_text', originalteks);
  form.append('replace_text', replacetext);
  const res = await axios.post('https://api.magiceraser.org/api/magiceraser/v2/text-replace/create-job', form, {
    headers: { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36', 'product-code': 'magiceraser', 'product-serial': genserial(), origin: 'https://imgupscaler.ai', referer: 'https://imgupscaler.ai/' }
  });
  return res.data.result.job_id;
}

async function cekjob(jobId) {
  const res = await axios.get(`https://api.magiceraser.org/api/magiceraser/v1/ai-remove/get-job/${jobId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36', origin: 'https://imgupscaler.ai', referer: 'https://imgupscaler.ai/' }
  });
  return res.data;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, filename, originalText, replaceText } = req.body;
    if (!imageBase64 || !originalText || !replaceText) return res.status(400).json({ error: 'Data tidak lengkap' });

    const buffer = Buffer.from(imageBase64.split(',')[1], 'base64');
    const mimetype = imageBase64.split(';')[0].split(':')[1];

    const uploadInfo = await upimage(filename || 'image.png');
    await uploadtoOSS(uploadInfo.url, buffer, mimetype);
    const cdnUrl = 'https://cdn.imgupscaler.ai/' + uploadInfo.object_name;
    const jobId = await createJob(cdnUrl, originalText, replaceText);

    let result;
    let attempts = 0;
    do {
      await new Promise(r => setTimeout(r, 3000));
      result = await cekjob(jobId);
      attempts++;
    } while ((!result.result || !result.result.output_url) && attempts < 15);

    if (result.result && result.result.output_url) {
      return res.status(200).json({
        status: 'success',
        developer: 'SANN404 FORUM',
        result_image: result.result.output_url[0]
      });
    } else {
      return res.status(504).json({ error: 'Timeout, coba lagi nanti.' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', msg: error.message });
  }
};
