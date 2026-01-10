import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebaseConfig';
import { ref, set, onValue, update, get } from "firebase/database";

const ROOM_ID = "ROOM_001"; // 建議之後可改為讓使用者輸入
const GAME_TIME = 180; 

export default function App() {
  const [role, setRole] = useState(null); 
  const [roomData, setRoomData] = useState(null);

  // 1. 全域監聽房間資料
  useEffect(() => {
    const roomRef = ref(db, `rooms/${ROOM_ID}`);
    return onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) setRoomData(snapshot.val());
    });
  }, []);

  // 2. 遊戲初始化邏輯 (洗牌題庫)
  const startGame = async () => {
    const snapshot = await get(ref(db, 'question_pool'));
    if (!snapshot.exists()) return alert("請先在後台匯入題庫！");
    
    // 取得所有題目並隨機洗牌
    let pool = Object.values(snapshot.val());
    const shuffled = pool.sort(() => Math.random() - 0.5);

    await update(ref(db, `rooms/${ROOM_ID}`), {
      state: 'PLAYING',
      queue: shuffled,
      currentIndex: 0,
      score: 0,
      history: [],
      timeLeft: GAME_TIME,
      startTime: Date.now()
    });
  };

  if (!role) {
    return (
      <div style={layoutStyle}>
        <h1 style={{color: '#1890ff'}}>台灣史你講我猜 v2.0</h1>
        <button style={bigBtn} onClick={() => setRole('projector')}>💻 我是投影幕 (電腦)</button>
        <button style={bigBtn} onClick={() => setRole('player')}>📱 我是猜題者 (手機)</button>
      </div>
    );
  }

  return role === 'projector' ? 
    <ProjectorView roomData={roomData} startGame={startGame} /> : 
    <PlayerView roomData={roomData} />;
}

// --- 投影幕組件 ---
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
        <h1>遊戲結束！得分：{roomData.score}</h1>
        <div style={historyBox}>
          {roomData.history?.map((h, i) => <div key={i} style={{color: h.type==='正確'?'#28a745':'#dc3545', fontSize: '24px', margin: '5px'}}>● {h.q} ({h.type})</div>)}
        </div>
        <button style={btnStyle} onClick={startGame}>再玩一局</button>
      </div>
    );
  }

  const currentQ = roomData.queue[roomData.currentIndex];
  return (
    <div style={{ ...layoutStyle, backgroundColor: '#000', color: '#fff' }}>
      <div style={{ fontSize: '40px', position: 'absolute', top: '20px' }}>
        時間：{roomData.timeLeft}s | 分數：{roomData.score}
      </div>
      <h1 style={{ fontSize: '180px', margin: '20px 0' }}>{currentQ?.term}</h1>
      <p style={{ fontSize: '40px', color: '#888' }}>({currentQ?.category})</p>
    </div>
  );
}

// --- 手機猜題者組件 ---
function PlayerView({ roomData }) {
  const [readyToTrigger, setReadyToTrigger] = useState(true);
  const [lastBeta, setLastBeta] = useState(0);

  const handleMotion = (e) => {
    const beta = e.beta;
    setLastBeta(beta?.toFixed(0));

    // A. 中立區判斷：只有回到 -20 到 20 度之間，才重啟觸發許可
    if (Math.abs(beta) < 20) {
      setReadyToTrigger(true);
      return;
    }

    // B. 觸發判斷：必須在許可狀態下
    if (!readyToTrigger || !roomData || roomData.state !== 'PLAYING') return;

    if (beta > 60) { // 點頭 (螢幕向地)
      submitAction('正確');
    } else if (beta < -60) { // 仰頭 (螢幕向天)
      submitAction('跳過');
    }
  };

  const submitAction = async (type) => {
    setReadyToTrigger(false); // 立即鎖定，直到回到中立區
    
    const nextIndex = roomData.currentIndex + 1;
    const currentQ = roomData.queue[roomData.currentIndex];
    const newHistory = [...(roomData.history || []), { q: currentQ.term, type: type }];
    
    // 如果題目用完了，結束遊戲
    const nextState = nextIndex >= roomData.queue.length ? 'ENDED' : 'PLAYING';

    await update(ref(db, `rooms/${ROOM_ID}`), {
      currentIndex: nextIndex,
      score: type === '正確' ? roomData.score + 1 : roomData.score,
      history: newHistory,
      state: nextState
    });
  };

  const enableGyro = () => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(s => {
        if (s === 'granted') window.addEventListener('deviceorientation', handleMotion);
      });
    } else {
      window.addEventListener('deviceorientation', handleMotion);
    }
  };

  if (!roomData || roomData.state !== 'PLAYING') {
    return <div style={layoutStyle}><h2>等待遊戲開始...</h2><button style={btnStyle} onClick={enableGyro}>啟動感應模式</button></div>;
  }

  return (
    <div style={{ ...layoutStyle, backgroundColor: readyToTrigger ? '#1890ff' : '#666', color: '#fff' }}>
      <h1>{roomData.queue[roomData.currentIndex]?.term}</h1>
      <p style={{marginTop: '40px'}}>{readyToTrigger ? "請把手機橫放在額頭" : "請回正手機..."}</p>
      <div style={{fontSize: '12px', opacity: 0.5}}>目前角度: {lastBeta}</div>
      
      <div style={{marginTop: '50px', display: 'flex', gap: '10px'}}>
        <button style={smallBtn} onClick={() => submitAction('正確')}>正確</button>
        <button style={smallBtn} onClick={() => submitAction('跳過')}>跳過</button>
      </div>
    </div>
  );
}

// --- 樣式設定 ---
const layoutStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center', padding: '20px', overflow: 'hidden' };
const bigBtn = { padding: '20px 40px', fontSize: '24px', margin: '15px', borderRadius: '15px', border: 'none', backgroundColor: '#1890ff', color: '#fff', cursor: 'pointer' };
const btnStyle = { padding: '15px 40px', fontSize: '20px', borderRadius: '10px', cursor: 'pointer', border: 'none', backgroundColor: '#28a745', color: '#fff' };
const smallBtn = { padding: '15px 30px', fontSize: '18px', borderRadius: '8px', border: 'none', backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' };
const historyBox = { maxHeight: '50vh', overflowY: 'auto', backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '10px', width: '80%', color: '#333' };