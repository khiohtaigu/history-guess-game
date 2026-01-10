import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { ref, set, onValue, update, get } from "firebase/database";

const ROOM_ID = "ROOM_001"; 
const GAME_TIME = 180; 

export default function App() {
  const [role, setRole] = useState(null); 
  const [roomData, setRoomData] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. 全域監聽房間資料
  useEffect(() => {
    const roomRef = ref(db, `rooms/${ROOM_ID}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        setRoomData(snapshot.val());
      } else {
        // 如果房間不存在，初始化一個
        set(roomRef, { state: 'LOBBY', score: 0, timeLeft: GAME_TIME });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. 遊戲初始化邏輯 (洗牌題庫)
  const startGame = async () => {
    try {
      const snapshot = await get(ref(db, 'question_pool'));
      if (!snapshot.exists()) {
        alert("資料庫內沒有題庫！請先匯入 Excel。");
        return;
      }
      
      let pool = Object.values(snapshot.val());
      const shuffled = pool.sort(() => Math.random() - 0.5);

      await update(ref(db, `rooms/${ROOM_ID}`), {
        state: 'PLAYING',
        queue: shuffled,
        currentIndex: 0,
        score: 0,
        history: [],
        timeLeft: GAME_TIME,
        lastAction: 'START'
      });
    } catch (e) {
      console.error("啟動失敗:", e);
    }
  };

  if (loading) return <div style={layoutStyle}>載入中...</div>;

  if (!role) {
    return (
      <div style={layoutStyle}>
        <h1 style={{color: '#1890ff', marginBottom: '40px'}}>台灣史「你講我猜」</h1>
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

  // 如果房間還在準備中 (LOBBY)
  if (!roomData || roomData.state === 'LOBBY') {
    return (
      <div style={layoutStyle}>
        <h1>準備開始遊戲</h1>
        <p>請讓猜題者準備好手機</p>
        <button style={btnStyle} onClick={startGame}>開始新回合</button>
      </div>
    );
  }

  // 如果遊戲結束 (ENDED)
  if (roomData.state === 'ENDED') {
    return (
      <div style={layoutStyle}>
        <h1 style={{fontSize: '60px'}}>遊戲結束！</h1>
        <h2 style={{fontSize: '40px'}}>最終得分：{roomData.score}</h2>
        <div style={historyBox}>
          {roomData.history?.map((h, i) => (
            <div key={i} style={{color: h.type==='正確'?'#28a745':'#dc3545', fontSize: '24px', margin: '5px'}}>
              ● {h.q} ({h.type})
            </div>
          ))}
        </div>
        <button style={btnStyle} onClick={startGame}>再玩一局</button>
      </div>
    );
  }

  // 核心保護：如果正在遊戲中但還沒抓到題目隊列，先顯示載入
  if (!roomData.queue || !roomData.queue[roomData.currentIndex]) {
    return <div style={layoutStyle}>題目讀取中...</div>;
  }

  const currentQ = roomData.queue[roomData.currentIndex];

  return (
    <div style={{ ...layoutStyle, backgroundColor: '#000', color: '#fff' }}>
      <div style={{ fontSize: '40px', position: 'absolute', top: '20px' }}>
        時間：{roomData.timeLeft}s | 目前得分：{roomData.score}
      </div>
      <h1 style={{ fontSize: '180px', margin: '20px 0' }}>{currentQ.term}</h1>
      <p style={{ fontSize: '40px', color: '#888' }}>主題：{currentQ.category}</p>
    </div>
  );
}

// --- 手機猜題者組件 ---
function PlayerView({ roomData }) {
  const [readyToTrigger, setReadyToTrigger] = useState(true);
  const [betaValue, setBetaValue] = useState(0);

  const enableGyro = () => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(s => {
        if (s === 'granted') window.addEventListener('deviceorientation', handleMotion);
      });
    } else {
      window.addEventListener('deviceorientation', handleMotion);
    }
  };

  const handleMotion = (e) => {
    const beta = e.beta;
    setBetaValue(beta?.toFixed(0));

    // 回正判定：回到 -25 ~ 25 度之間
    if (Math.abs(beta) < 25) {
      setReadyToTrigger(true);
      return;
    }

    // 觸發判定
    if (!readyToTrigger || !roomData || roomData.state !== 'PLAYING') return;

    if (beta > 65) { 
      submitAction('正確');
    } else if (beta < -65) { 
      submitAction('跳過');
    }
  };

  const submitAction = async (type) => {
    setReadyToTrigger(false); 
    const nextIndex = roomData.currentIndex + 1;
    const currentQ = roomData.queue[roomData.currentIndex];
    const newHistory = [...(roomData.history || []), { q: currentQ.term, type: type }];
    const nextState = nextIndex >= roomData.queue.length ? 'ENDED' : 'PLAYING';

    await update(ref(db, `rooms/${ROOM_ID}`), {
      currentIndex: nextIndex,
      score: type === '正確' ? roomData.score + 1 : roomData.score,
      history: newHistory,
      state: nextState
    });
  };

  if (!roomData || roomData.state !== 'PLAYING') {
    return (
      <div style={layoutStyle}>
        <h2>等待投影幕端開始...</h2>
        <button style={btnStyle} onClick={enableGyro}>啟動感應模式</button>
      </div>
    );
  }

  const currentQ = roomData.queue[roomData.currentIndex];

  return (
    <div style={{ ...layoutStyle, backgroundColor: readyToTrigger ? '#1890ff' : '#444', color: '#fff' }}>
      <h2 style={{fontSize: '40px'}}>{currentQ?.term}</h2>
      <p style={{marginTop: '30px', fontSize: '20px'}}>
        {readyToTrigger ? "手機放在額頭 (螢幕朝前)" : "已記錄！請回正手機..."}
      </p>
      <div style={{position: 'absolute', bottom: '20px', fontSize: '12px', opacity: 0.3}}>
        角度偵測: {betaValue}
      </div>
      <div style={{marginTop: '40px', display: 'flex', gap: '20px'}}>
        <button style={smallBtn} onClick={() => submitAction('正確')}>正確</button>
        <button style={smallBtn} onClick={() => submitAction('跳過')}>跳過</button>
      </div>
    </div>
  );
}

// --- 樣式設定 ---
const layoutStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center', padding: '20px', overflow: 'hidden', fontFamily: 'sans-serif' };
const bigBtn = { padding: '25px 50px', fontSize: '24px', margin: '15px', borderRadius: '15px', border: 'none', backgroundColor: '#1890ff', color: '#fff', cursor: 'pointer', width: '300px' };
const btnStyle = { padding: '15px 40px', fontSize: '20px', borderRadius: '10px', cursor: 'pointer', border: 'none', backgroundColor: '#28a745', color: '#fff', marginTop: '20px' };
const smallBtn = { padding: '20px 30px', fontSize: '20px', borderRadius: '10px', border: 'none', backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' };
const historyBox = { maxHeight: '50vh', overflowY: 'auto', backgroundColor: '#eee', padding: '20px', borderRadius: '10px', width: '80%', color: '#333', marginTop: '20px', textAlign: 'left' };