import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { ref, onValue } from 'firebase/database';

const QuestionList = () => {
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    // 監聽 question_pool 節點
    const qRef = ref(db, 'question_pool');
    onValue(qRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setQuestions(data);
      }
    });
  }, []);

  return (
    <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h3>目前資料庫題庫 (共 {questions.length} 題)</h3>
      <div style={{ maxHeight: '300px', overflowY: 'auto', textAlign: 'left' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f4f4f4' }}>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>名詞</th>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>章節</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q, index) => (
              <li key={index} style={{ listStyle: 'none', borderBottom: '1px solid #eee', padding: '5px' }}>
                <strong>{q.term}</strong> - <small>{q.category}</small>
              </li>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QuestionList;