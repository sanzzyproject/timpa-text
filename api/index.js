const FormData = require('form-data')
const axios = require('axios')

// Fungsi Helper: Generate Serial (TIDAK DIUBAH)
function genserial() {
  let s = ''
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
  return s
}

// Fungsi 1: Dapatkan URL Upload (TIDAK DIUBAH LOGIKANYA)
async function upimage(filename) {
  const form = new FormData()
  form.append('file_name', filename)

  const res = await axios.post('https://api.imgupscaler.ai/api/common/upload/upload-image',
    form,
    {
      headers: {
        ...form.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        origin: 'https://imgupscaler.ai',
        referer: 'https://imgupscaler.ai/'
      }
    }
  )

  return res.data.result
}

// Fungsi 2: Upload ke Server (DISESUAIKAN UNTUK VERCEL/BUFFER)
// Kita ubah sedikit agar menerima 'Buffer' dari memori, bukan 'fs.createReadStream' dari disk
async function uploadtoOSS(putUrl, imageBuffer, mimetype) {
  const res = await axios.put(
    putUrl,
    imageBuffer,
    {
      headers: {
        'Content-Type': mimetype
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }
  )

  return res.status === 200
}

// Fungsi 3: Buat Job AI (TIDAK DIUBAH)
async function createJob(imgurl, originalteks, replacetext) {
  const form = new FormData()
  form.append('original_image_url', imgurl)
  form.append('original_text', originalteks)
  form.append('replace_text', replacetext)

  const res = await axios.post('https://api.magiceraser.org/api/magiceraser/v2/text-replace/create-job',
    form,
    {
      headers: {
        ...form.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'product-code': 'magiceraser',
        'product-serial': genserial(),
        origin: 'https://imgupscaler.ai',
        referer: 'https://imgupscaler.ai/'
      }
    }
  )

  return res.data.result.job_id
}

// Fungsi 4: Cek Status Job (TIDAK DIUBAH)
async function cekjob(jobId) {
  const res = await axios.get(`https://api.magiceraser.org/api/magiceraser/v1/ai-remove/get-job/${jobId}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        origin: 'https://imgupscaler.ai',
        referer: 'https://imgupscaler.ai/'
      }
    }
  )

  return res.data
}

// --- HANDLER UTAMA VERCEL ---
// Ini pengganti bagian "textreplace(...).then()" agar bisa dipanggil dari Frontend
module.exports = async (req, res) => {
  // Setup CORS agar Frontend bisa akses Backend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle pre-flight request browser
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Hanya terima method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Ambil data dari Frontend
    const { imageBase64, filename, originalText, replaceText } = req.body;

    if (!imageBase64 || !originalText || !replaceText) {
      return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    // 2. Convert Base64 (Text) menjadi Buffer (Binary Image)
    // Ini perlu karena 'uploadtoOSS' butuh fisik file, bukan text base64
    const buffer = Buffer.from(imageBase64.split(',')[1], 'base64');
    const mimetype = imageBase64.split(';')[0].split(':')[1]; // contoh: image/png

    // 3. Jalankan Logika Aslimu (Step by Step)
    
    // Step A: Dapatkan Link Upload
    const uploadInfo = await upimage(filename || 'image.png');
    
    // Step B: Upload Gambar ke Link tersebut (Pakai Buffer)
    await uploadtoOSS(uploadInfo.url, buffer, mimetype);

    // Step C: Susun URL CDN
    const cdnUrl = 'https://cdn.imgupscaler.ai/' + uploadInfo.object_name;

    // Step D: Create Job AI
    const jobId = await createJob(cdnUrl, originalText, replaceText);

    // Step E: Looping Cek Hasil (Polling)
    let result;
    let attempts = 0;
    const maxAttempts = 20; // Maksimal cek 20x (sekitar 60 detik) agar tidak timeout

    do {
      await new Promise(r => setTimeout(r, 3000)); // Tunggu 3 detik
      result = await cekjob(jobId);
      attempts++;
    } while ((!result.result || !result.result.output_url) && attempts < maxAttempts);

    // 4. Kirim Hasil ke Frontend
    if (result.result && result.result.output_url) {
      return res.status(200).json({
        status: 'success',
        developer: 'SANN404 FORUM',
        result_image: result.result.output_url[0] // Ambil URL hasil
      });
    } else {
      return res.status(504).json({ error: 'Proses AI terlalu lama, silakan coba lagi.' });
    }

  } catch (error) {
    console.error("Error Backend:", error);
    return res.status(500).json({ 
      error: 'Terjadi kesalahan pada server',
      details: error.message 
    });
  }
};
