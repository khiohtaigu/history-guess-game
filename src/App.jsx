import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebaseConfig';
import { ref, set, onValue, update, get } from "firebase/database";

const ROOM_ID = "ROOM_001"; 
const GAME_TIME = 180; 

export default function App() {
  const [role, setRole] = useState(null); 
  const [roomData, setRoomData] = useState(null);
  const roomDataRef = useRef(null);

  useEffect(() => {
    const roomRef = ref(db, `rooms/${ROOM_ID}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRoomData(data);
        roomDataRef.current = data;
      } else {
        set(roomRef, { state: 'LOBBY', score: 0, timeLeft: GAME_TIME });
      }
    });
    return () => unsubscribe();
  }, []);

  const startGame = async () => {
    const snapshot = await get(ref(db, 'question_pool'));
    if (!snapshot.exists()) return alert("請先匯入題庫！");
    let pool = Object.values(snapshot.val());
    const shuffled = pool.sort(() => Math.random() - 0.5);
    await update(ref(db, `rooms/${ROOM_ID}`), {
      state: 'PLAYING', queue: shuffled, currentIndex: 0,
      score: 0, history: [], timeLeft: GAME_TIME
    });
  };

  if (!role) {
    return (
      <div style={layoutStyle}>
        <h1 style={{color: '#1890ff', marginBottom: '40px'}}>台灣史「你講我猜」系統</h1>
        <button style={bigBtn} onClick={() => setRole('projector')}>💻 我是投影幕 (電腦)</button>
        <button style={bigBtn} onClick={() => setRole('player')}>📱 我是控制器 (手機)</button>
      </div>
    );
  }

  return role === 'projector' ? 
    <ProjectorView roomData={roomData} startGame={startGame} /> : 
    <PlayerView roomDataRef={roomDataRef} />;
}

// --- 投影幕組件 (三欄式佈局) ---
function ProjectorView({ roomData, startGame }) {
  useEffect(() => {
    let timer;
    if (roomData?.state === 'PLAYING' && roomData.timeLeft > 0) {
      timer = setInterval(() => {
        update(ref(db, `rooms/${ROOM_ID}`), { timeLeft: roomData.timeLeft - 1 });
      }, 1000);
    } else if (roomData?.timeLeft === 0 && roomData.state === 'PLAYING') {
      update(ref(db, `rooms/${ROOM_ID}`), { state: 'ENDED' });
    }
    return () => clearInterval(timer);
  }, [roomData?.state, roomData?.timeLeft]);

  if (!roomData || roomData.state === 'LOBBY') {
    return <div style={layoutStyle}><h1>準備開始遊戲</h1><button style={btnStyle} onClick={startGame}>開始新回合</button></div>;
  }

  if (roomData.state === 'ENDED') {
    return (
      <div style={layoutStyle}>
        <h1 style={{fontSize: '60px'}}>回合結束</h1>
        <h2 style={{fontSize: '80px', color: '#1890ff'}}>最終得分：{roomData.score}</h2>
        <button style={btnStyle} onClick={startGame}>再玩一局</button>
      </div>
    );
  }

  const currentQ = roomData.queue?.[roomData.currentIndex];
  // 分類歷史紀錄
  const correctHistory = roomData.history?.filter(h => h.type === '正確') || [];
  const skipHistory = roomData.history?.filter(h => h.type === '跳過') || [];

  return (
    <div style={gameScreenStyle}>
      {/* 頂部資訊欄 */}
      <div style={topBar}>
        <div style={infoText}>剩餘時間：{roomData.timeLeft}s</div>
        <div style={infoText}>目前分數：{roomData.score}</div>
      </div>

      <div style={mainContent}>
        {/* 左側：正確清單 */}
        <div style={sideColumn}>
          <h2 style={{color: '#28a745', borderBottom: '2px solid #28a745'}}>正確 ({correctHistory.length})</h2>
          <div style={listScroll}>
            {correctHistory.slice().reverse().map((h, i) => (
              <div key={i} style={listItem}>✔ {h.q}</div>
            ))}
          </div>
        </div>

        {/* 中間：目前題目 */}
        <div style={centerColumn}>
          <div style={{fontSize: '40px', color: '#aaa', marginBottom: '20px'}}>{currentQ?.category}</div>
          <h1 style={{fontSize: '120px', margin: '0', color: '#fff'}}>{currentQ?.term}</h1>
        </div>

        {/* 右側：跳過清單 */}
        <div style={sideColumn}>
          <h2 style={{color: '#dc3545', borderBottom: '2px solid #dc3545'}}>跳過 ({skipHistory.length})</h2>
          <div style={listScroll}>
            {skipHistory.slice().reverse().map((h, i) => (
              <div key={i} style={listItem}>✘ {h.q}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- 控制器組件 ---
function PlayerView({ roomDataRef }) {
  const submitAction = async (type) => {
    const data = roomDataRef.current;
    if (!data || data.state !== 'PLAYING') return;

    const nextIndex = data.currentIndex + 1;
    const currentQ = data.queue[data.currentIndex];
    const newHistory = [...(data.history || []), { q: currentQ.term, type: type }];
    
    await update(ref(db, `rooms/${ROOM_ID}`), {
      currentIndex: nextIndex,
      score: type === '正確' ? data.score + 1 : data.score,
      history: newHistory,
      state: nextIndex >= data.queue.length ? 'ENDED' : 'PLAYING'
    });
  };

  const currentData = roomDataRef.current;
  if (!currentData || currentData.state !== 'PLAYING') {
    return <div style={layoutStyle}><h2>等待遊戲開始...</h2><p>請在電腦端按下開始</p></div>;
  }

  return (
    <div style={{ ...layoutStyle, backgroundColor: '#1890ff', color: '#fff' }}>
      <h2 style={{fontSize: '40px', marginBottom: '50px'}}>{currentData.queue?.[currentData.currentIndex]?.term}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '80%' }}>
        <button style={{ ...controlBtn, backgroundColor: '#28a745' }} onClick={() => submitAction('正確')}>正確 (點頭)</button>
        <button style={{ ...controlBtn, backgroundColor: '#dc3545' }} onClick={() => submitAction('跳過')}>跳過 (仰頭)</button>
      </div>
    </div>
  );
}

// --- 樣式設定 (三欄式佈局) ---
const layoutStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center', padding: '20px' };
const gameScreenStyle = { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#111', color: '#fff', overflow: 'hidden' };
const topBar = { display: 'flex', justifyContent: 'space-around', padding: '20px', backgroundColor: '#222', borderBottom: '1px solid #333' };
const infoText = { fontSize: '32px', fontWeight: 'bold' };

const mainContent = { display: 'flex', flex: 1, overflow: 'hidden' };
const sideColumn = { width: '25%', padding: '20px', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' };
const centerColumn = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', borderLeft: '1px solid #333', borderRight: '1px solid #333' };

const listScroll = { flex: 1, overflowY: 'auto', marginTop: '10px' };
const listItem = { fontSize: '24px', padding: '10px 0', borderBottom: '1px solid #222', textAlign: 'left' };

const bigBtn = { padding: '25px 50px', fontSize: '24px', margin: '15px', borderRadius: '15px', border: 'none', backgroundColor: '#1890ff', color: '#fff', cursor: 'pointer', width: '320px' };
const btnStyle = { padding: '15px 40px', fontSize: '24px', borderRadius: '10px', cursor: 'pointer', border: 'none', backgroundColor: '#28a745', color: '#fff', marginTop: '20px' };
const controlBtn = { padding: '30px', fontSize: '28px', border: 'none', borderRadius: '15px', color: '#fff', fontWeight: 'bold' };
const historyBox = { maxHeight: '60vh', overflowY: 'auto', width: '80%', padding: '20px' };