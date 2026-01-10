import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { db } from './firebaseConfig';
import { ref, set } from 'firebase/database';

const ExcelUploader = () => {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState([]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // 將 Excel 轉為 JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      // 轉換格式以符合我們的需求
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
      // 將所有題目存入 Firebase 的 question_pool 節點
      await set(ref(db, 'question_pool'), preview);
      alert(`成功匯入 ${preview.length} 筆題目！`);
    } catch (error) {
      console.error(error);
      alert("匯入失敗，請檢查 Firebase 權限設定。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '10px' }}>
      <h3>1. 匯入歷史題庫 (Excel)</h3>
      <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />
      
      {preview.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <p>預覽前 3 筆資料：</p>
          <ul>
            {preview.slice(0, 3).map((item, index) => (
              <li key={index}>{item.category} - {item.term}</li>
            ))}
          </ul>
          <button onClick={uploadToFirebase} disabled={loading}>
            {loading ? "上傳中..." : "確認匯入 Firebase"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ExcelUploader;