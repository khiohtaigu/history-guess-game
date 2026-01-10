import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebaseConfig';
import { ref, set, onValue, update, get } from "firebase/database";

const ROOM_ID = "ROOM_001"; 
const GAME_TIME = 180; 

export default function App() {
  const [role, setRole] = useState(null); 
  const [roomData, setRoomData] = useState(null);
  const [loading, setLoading] = useState(true);

  // 使用 Ref 確保感應器監聽器永遠能讀到最新的 roomData
  const roomDataRef = useRef(null);

  useEffect(() => {
    const roomRef = ref(db, `rooms/${ROOM_ID}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRoomData(data);
        roomDataRef.current = data; // 更新 Ref
      } else {
        set(roomRef, { state: 'LOBBY', score: 0, timeLeft: GAME_TIME });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const startGame = async () => {
    try {
      const snapshot = await get(ref(db, 'question_pool'));
      if (!snapshot.exists()) return alert("請先匯入題庫！");
      let pool = Object.values(snapshot.val());
      const shuffled = pool.sort(() => Math.random() - 0.5);
      await update(ref(db, `rooms/${ROOM_ID}`), {
        state: 'PLAYING', queue: shuffled, currentIndex: 0,
        score: 0, history: [], timeLeft: GAME_TIME
      });
    } catch (e) { console.error(e); }
  };

  if (loading) return <div style={layoutStyle}>載入中...</div>;

  if (!role) {
    return (
      <div style={layoutStyle}>
        <h1 style={{color: '#1890ff', marginBottom: '40px'}}>台灣史「你講我猜」</h1>
        <button style={bigBtn} onClick={() => setRole('projector')}>💻 我是投影幕</button>
        <button style={bigBtn} onClick={() => setRole('player')}>📱 我是猜題者</button>
      </div>
    );
  }

  return role === 'projector' ? 
    <ProjectorView roomData={roomData} startGame={startGame} /> : 
    <PlayerView roomDataRef={roomDataRef} />;
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
    return (
      <div style={layoutStyle}>
        <h1>準備開始遊戲</h1>
        <button style={btnStyle} onClick={startGame}>開始新回合</button>
      </div>
    );
  }

  if (roomData.state === 'ENDED') {
    return (
      <div style={layoutStyle}>
        <h1 style={{fontSize: '60px'}}>結束！得分：{roomData.score}</h1>
        <div style={historyBox}>
          {roomData.history?.map((h, i) => (
            <div key={i} style={{color: h.type==='正確'?'#28a745':'#dc3545', fontSize: '24px'}}>
              ● {h.q} ({h.type})
            </div>
          ))}
        </div>
        <button style={btnStyle} onClick={startGame}>再玩一局</button>
      </div>
    );
  }

  const currentQ = roomData.queue?.[roomData.currentIndex];
  return (
    <div style={{ ...layoutStyle, backgroundColor: '#000', color: '#fff' }}>
      <div style={{ fontSize: '40px', position: 'absolute', top: '20px' }}>
        時間：{roomData.timeLeft}s | 得分：{roomData.score}
      </div>
      <h1 style={{ fontSize: '180px', margin: '20px 0' }}>{currentQ?.term}</h1>
      <p style={{ fontSize: '40px', color: '#888' }}>{currentQ?.category}</p>
    </div>
  );
}

// --- 手機猜題者組件 ---
function PlayerView({ roomDataRef }) {
  const [readyToTrigger, setReadyToTrigger] = useState(true);
  const [debugBeta, setDebugBeta] = useState(0);
  
  // 使用 Ref 鎖定狀態，避免事件監聽器抓到舊值
  const readyRef = useRef(true);

  const handleMotion = (e) => {
    const beta = e.beta;
    setDebugBeta(beta?.toFixed(0));

    // 1. 中立區判定 (回正)
    if (Math.abs(beta) < 20) {
      readyRef.current = true;
      setReadyToTrigger(true);
      return;
    }

    // 2. 觸發判定
    if (!readyRef.current) return;
    const currentData = roomDataRef.current;
    if (!currentData || currentData.state !== 'PLAYING') return;

    // 基於你測得的 4, -178, 6 數值：
    // 點頭通常往正值走 (或是極大的負值如 -178)
    if (beta > 50 || beta < -130) { 
      submitAction('正確');
    } else if (beta < -50 && beta > -130) { 
      submitAction('跳過');
    }
  };

  const submitAction = async (type) => {
    readyRef.current = false;
    setReadyToTrigger(false);

    const currentData = roomDataRef.current;
    const nextIndex = currentData.currentIndex + 1;
    const currentQ = currentData.queue[currentData.currentIndex];
    const newHistory = [...(currentData.history || []), { q: currentQ.term, type: type }];
    const nextState = nextIndex >= currentData.queue.length ? 'ENDED' : 'PLAYING';

    await update(ref(db, `rooms/${ROOM_ID}`), {
      currentIndex: nextIndex,
      score: type === '正確' ? currentData.score + 1 : currentData.score,
      history: newHistory,
      state: nextState
    });
  };

  const enableGyro = () => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(s => {
        if (s === 'granted') {
          window.removeEventListener('deviceorientation', handleMotion);
          window.addEventListener('deviceorientation', handleMotion, true);
        }
      });
    } else {
      window.addEventListener('deviceorientation', handleMotion, true);
    }
    alert("感應器已啟動，請將手機橫放額頭");
  };

  const currentData = roomDataRef.current;
  if (!currentData || currentData.state !== 'PLAYING') {
    return (
      <div style={layoutStyle}>
        <h2>等待遊戲開始...</h2>
        <button style={btnStyle} onClick={enableGyro}>1. 啟動感應器</button>
      </div>
    );
  }

  const currentQ = currentData.queue?.[currentData.currentIndex];

  return (
    <div style={{ ...layoutStyle, backgroundColor: readyToTrigger ? '#1890ff' : '#444', color: '#fff' }}>
      <h2 style={{fontSize: '48px'}}>{currentQ?.term}</h2>
      <p style={{fontSize: '20px', marginTop: '20px'}}>
        {readyToTrigger ? "手機放在額頭 (螢幕朝前)" : "已記錄！請回正手機..."}
      </p>
      
      <div style={{position: 'absolute', bottom: '20px', fontSize: '14px'}}>
        角度：{debugBeta} | 狀態：{readyToTrigger ? '可觸發' : '鎖定中'}
      </div>

      <div style={{marginTop: '40px', display: 'flex', gap: '20px'}}>
        <button style={smallBtn} onClick={() => submitAction('正確')}>正確</button>
        <button style={smallBtn} onClick={() => submitAction('跳過')}>跳過</button>
      </div>
    </div>
  );
}

// --- 樣式 ---
const layoutStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center', padding: '20px', overflow: 'hidden' };
const bigBtn = { padding: '25px 50px', fontSize: '24px', margin: '15px', borderRadius: '15px', border: 'none', backgroundColor: '#1890ff', color: '#fff', cursor: 'pointer' };
const btnStyle = { padding: '15px 40px', fontSize: '20px', borderRadius: '10px', cursor: 'pointer', border: 'none', backgroundColor: '#28a745', color: '#fff' };
const smallBtn = { padding: '20px 30px', fontSize: '20px', borderRadius: '10px', border: 'none', backgroundColor: 'rgba(255,255,255,0.3)', color: '#fff' };
const historyBox = { maxHeight: '50vh', overflowY: 'auto', backgroundColor: '#eee', padding: '20px', borderRadius: '10px', width: '80%', color: '#333', marginTop: '20px', textAlign: 'left' };