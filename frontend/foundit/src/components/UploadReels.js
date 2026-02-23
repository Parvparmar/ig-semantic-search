import React, {useState} from 'react';

export default function UploadReels() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');

  const upload = async () => {
    if (!file) return setStatus('Please select a file first');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('user_id', 'default');

    setStatus('Uploading...');
    try {
      const res = await fetch('http://localhost:8000/upload-reels', { method: 'POST', body: fd });
      const data = await res.json();
      setStatus(JSON.stringify(data));
    } catch (e) {
      setStatus('Upload error: ' + e.message);
    }
  };

  return (
    <div style={{padding:20}}>
      <h3>Upload reelsjs.txt</h3>
      <input type="file" accept=".txt" onChange={e=>setFile(e.target.files[0])} />
      <button onClick={upload} style={{marginLeft:8}}>Upload & Process</button>
      <div style={{marginTop:8}}><strong>Status:</strong> {status}</div>
    </div>
  );
}
