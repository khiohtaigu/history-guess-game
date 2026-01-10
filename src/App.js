import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from './firebaseConfig';
import { ref, set, onValue } from "firebase/database";

// --- 子組件: Excel 題庫匯入器 ---
const ExcelUploader = () => {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState([]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      const formattedData = jsonData.map(item => ({
        id: item['序號'] || Math.random(),
        term: item['名詞'] || '',
        category: item['章節'] || '未分類'
      }));
      setPreview(formattedData);
    };
    reader.readAsArrayBuffer(file);
  };

  const uploadToFirebase = async () => {
    if (preview.length === 0) return alert("請選擇檔案");
    setLoading(true);
    try {
      await set(ref(db, 'question_pool'), preview);
      alert(`成功匯入 ${preview.length} 題`);
    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  return (
    <div style={cardStyle}>
      <h3>1. 匯入題庫 (Vite 版)</h3>
      <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />
      {preview.length > 0 && <button onClick={uploadToFirebase} disabled={loading} style={btnStyle}>確認匯入</button>}
    </div>
  );
};

// --- 子組件: 題庫查看 ---
const QuestionList = () => {
  const [questions, setQuestions] = useState([]);
  useEffect(() => onValue(ref(db, 'question_pool'), s => s.exists() && setQuestions(s.val())), []);
  return (
    <div style={cardStyle}>
      <h3>雲端題庫 ({questions.length})</h3>
      <div style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '12px', textAlign: 'left' }}>
        {questions.map((q, i) => <div key={i}>{i+1}. {q.term}</div>)}
      </div>
    </div>
  );
};

// --- 子組件: 手機感應測試 ---
const GyroTest = () => {
  const [status, setStatus] = useState('未授權');
  const [beta, setBeta] = useState(0);

  const requestPermission = () => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(s => {
        if(s==='granted'){
          window.addEventListener('deviceorientation', e => setBeta(e.beta?.toFixed(0)));
          setStatus('授權成功');
        }
      });
    } else {
      window.addEventListener('deviceorientation', e => setBeta(e.beta?.toFixed(0)));
      setStatus('監聽中');
    }
  };

  return (
    <div style={{ ...cardStyle, backgroundColor: '#fffbe6' }}>
      <h3>2. 手機感應測試</h3>
      <button onClick={requestPermission} style={btnStyle}>點擊授權感應器</button>
      <h1 style={{ fontSize: '60px' }}>{beta}</h1>
    </div>
  );
};

export default function App() {
  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '20px', textAlign: 'center' }}>
      <h2>台灣史遊戲 (Vite + Firebase)</h2>
      <ExcelUploader />
      <QuestionList />
      <GyroTest />
    </div>
  );
}
//test
const cardStyle = { border: '1px solid #ddd', padding: '15px', borderRadius: '10px', marginBottom: '15px' };
const btnStyle = { padding: '10px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '5px', marginTop: '10px' };