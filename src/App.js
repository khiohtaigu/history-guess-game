import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

// --- Firebase 配置 (讀取自 .env.local) ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- 子組件 1: Excel 題庫匯入器 ---
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
        book: item['分冊'] || '',
        category: item['章節'] || '未分類',
        keywords: item['關鍵字'] || ''
      }));
      setPreview(formattedData);
    };
    reader.readAsArrayBuffer(file);
  };

  const uploadToFirebase = async () => {
    if (preview.length === 0) return alert("請先選擇檔案！");
    setLoading(true);
    try {
      await set(ref(db, 'question_pool'), preview);
      alert(`成功匯入 ${preview.length} 筆題目！`);
    } catch (error) {
      alert(`匯入失敗：${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={cardStyle}>
      <h3>1. 匯入歷史題庫 (Excel)</h3>
      <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />
      {preview.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <p>預覽前 3 筆：{preview.slice(0, 3).map(i => i.term).join(', ')}...</p>
          <button onClick={uploadToFirebase} disabled={loading} style={btnStyle}>
            {loading ? "上傳中..." : "確認匯入 Firebase"}
          </button>
        </div>
      )}
    </div>
  );
};

// --- 子組件 2: 題庫清單查看器 ---
const QuestionList = () => {
  const [questions, setQuestions] = useState([]);
  useEffect(() => {
    return onValue(ref(db, 'question_pool'), (snapshot) => {
      if (snapshot.exists()) setQuestions(snapshot.val());
    });
  }, []);

  return (
    <div style={cardStyle}>
      <h3>目前雲端題庫 (共 {questions.length} 題)</h3>
      <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #eee', padding: '10px', textAlign: 'left' }}>
        {questions.length > 0 ? (
          questions.map((q, i) => <div key={i} style={{fontSize: '14px'}}>{i+1}. {q.category} - {q.term}</div>)
        ) : <p>資料庫目前沒有資料</p>}
      </div>
    </div>
  );
};

// --- 子組件 3: 手機感應器測試 ---
const GyroTest = () => {
  const [status, setStatus] = useState('等待授權');
  const [beta, setBeta] = useState(0);

  const requestPermission = () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(state => {
          if (state === 'granted') {
            window.addEventListener('deviceorientation', (e) => setBeta(e.beta?.toFixed(0)));
            setStatus('授權成功');
          }
        }).catch(() => setStatus('授權失敗'));
    } else {
      window.addEventListener('deviceorientation', (e) => setBeta(e.beta?.toFixed(0)));
      setStatus('監聽中 (非 iOS)');
    }
  };

  return (
    <div style={{ ...cardStyle, backgroundColor: '#fffbe6' }}>
      <h3>2. 手機感應器測試</h3>
      <p>狀態：{status}</p>
      <button onClick={requestPermission} style={btnStyle}>啟動感應器</button>
      <h1 style={{ fontSize: '48px', color: '#faad14' }}>Beta: {beta}</h1>
      <p style={{ fontSize: '12px', color: '#888' }}>
        面朝前放額頭：點頭 (Beta 變大) / 仰頭 (Beta 變小)
      </p>
    </div>
  );
};

// --- 主程式進入點 ---
export default function App() {
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h2 style={{ color: '#1890ff' }}>台灣史「你講我猜」管理後台</h2>
      <ExcelUploader />
      <QuestionList />
      <GyroTest />
      <footer style={{ marginTop: '30px', color: '#ccc', fontSize: '12px' }}>
        Firebase 狀態：{process.env.REACT_APP_FIREBASE_PROJECT_ID ? '已連線' : '未設定'}
      </footer>
    </div>
  );
}

// --- 簡易樣式 ---
const cardStyle = {
  border: '1px solid #f0f0f0',
  borderRadius: '8px',
  padding: '15px',
  marginBottom: '20px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  backgroundColor: '#fff'
};

const btnStyle = {
  marginTop: '10px',
  padding: '8px 16px',
  backgroundColor: '#1890ff',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
};