import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebaseConfig';
import { ref, set, onValue, update, push } from "firebase/database";

const ROOM_ID = "ROOM_001"; // 之後可擴充為動態代碼
const GAME_TIME = 180; // 遊戲時間（秒）

export default function App() {
  const [role, setRole] = useState(null); // 'projector' or 'player'
  const [gameState, setGameState] = useState('LOBBY'); // LOBBY, STARTING, PLAYING, ENDED
  const [currentQ, setCurrentQ] = useState(null);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [score, setScore] = useState(0);
  const [history, setHistory] = useState([]); // 紀錄對錯

  // 1. 監聽 Firebase 房間狀態
  useEffect(() => {
    const roomRef = ref(db, `rooms/${ROOM_ID}`);
    return onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameState(data.state || 'LOBBY');
        setCurrentQ(data.currentQuestion);
        setTimeLeft(data.timeLeft);
        setScore(data.score || 0);
        setHistory(data.history || []);
      }
    });
  }, []);

  // 2. 主流程控制：建立遊戲
  const createGame = async () => {
    // 從資料庫隨機抓一題
    onValue(ref(db, 'question_pool'), (snapshot) => {
      const pool = snapshot.val();
      if (!pool) return alert("請先匯入題庫！");
      const randomQ = pool[Math.floor(Math.random() * pool.length)];
      
      update(ref(db, `rooms/${ROOM_ID}`), {
        state: 'PLAYING',
        currentQuestion: randomQ,
        timeLeft: GAME_TIME,
        score: 0,
        history: [],
        lastActionTime: Date.now()
      });
    }, { onlyOnce: true });
  };

  // 渲染不同角色畫面
  if (!role) {
    return (
      <div style={layoutStyle}>
        <h1>台灣史「你講我猜」</h1>
        <button style={bigBtn} onClick={() => setRole('projector')}>我是投影幕 (電腦)</button>
        <button style={bigBtn} onClick={() => setRole('player')}>我是猜題者 (手機)</button>
      </div>
    );
  }

  return role === 'projector' ? 
    <ProjectorView gameState={gameState} currentQ={currentQ} timeLeft={timeLeft} score={score} createGame={createGame} history={history} /> : 
    <PlayerView gameState={gameState} currentQ={currentQ} roomId={ROOM_ID} />;
}

// --- 投影幕組件 ---
function ProjectorView({ gameState, currentQ, timeLeft, score, createGame, history }) {
  useEffect(() => {
    let timer;
    if (gameState === 'PLAYING' && timeLeft > 0) {
      timer = setInterval(() => {
        update(ref(db, `rooms/${ROOM_ID}`), { timeLeft: timeLeft - 1 });
      }, 1000);
    } else if (timeLeft === 0 && gameState === 'PLAYING') {
      update(ref(db, `rooms/${ROOM_ID}`), { state: 'ENDED' });
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft]);

  if (gameState === 'LOBBY') return <div style={layoutStyle}><h1>準備開始遊戲</h1><button style={btnStyle} onClick={createGame}>開始新回合</button></div>;
  if (gameState === 'ENDED') return (
    <div style={layoutStyle}>
      <h1>遊戲結束！得分：{score}</h1>
      <div style={historyBox}>
        {history.map((h, i) => <div key={i} style={{color: h.type==='正'?'green':'red'}}>{h.q} ({h.type})</div>)}
      </div>
      <button style={btnStyle} onClick={createGame}>再玩一局</button>
    </div>
  );

  return (
    <div style={{ ...layoutStyle, backgroundColor: '#000', color: '#fff' }}>
      <div style={{ fontSize: '40px' }}>剩餘時間：{timeLeft}s | 分數：{score}</div>
      <h1 style={{ fontSize: '150px', margin: '50px 0' }}>{currentQ?.term}</h1>
      <p style={{ fontSize: '30px', color: '#aaa' }}>章節：{currentQ?.category}</p>
    </div>
  );
}

// --- 手機猜題者組件 ---
function PlayerView({ gameState, currentQ, roomId }) {
  const [isLocked, setIsLocked] = useState(false);

  const requestGyro = () => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(s => {
        if (s === 'granted') window.addEventListener('deviceorientation', handleMotion);
      });
    } else {
      window.addEventListener('deviceorientation', handleMotion);
    }
  };

  const handleMotion = (e) => {
    if (isLocked) return;
    const b = e.beta;
    // 判定邏輯：當手機大動作傾斜時 (基於你測得的 0 為中心)
    if (b > 70 || b < -70) {
      const actionType = b > 70 ? '正' : '跳'; // 傾斜方向區分正確或跳過
      triggerNext(actionType);
    }
  };

  const triggerNext = (type) => {
    setIsLocked(true);
    // 1. 更新分數與歷史紀錄
    onValue(ref(db, `rooms/${roomId}`), (snapshot) => {
      const data = snapshot.val();
      const pool = []; // 這裡需要重新抓題庫，為簡化邏輯先監聽
      onValue(ref(db, 'question_pool'), (qSnap) => {
        const questions = qSnap.val();
        const nextQ = questions[Math.floor(Math.random() * questions.length)];
        const newHistory = [...(data.history || []), { q: currentQ.term, type: type }];
        
        update(ref(db, `rooms/${roomId}`), {
          currentQuestion: nextQ,
          score: type === '正' ? (data.score || 0) + 1 : (data.score || 0),
          history: newHistory
        });
      }, { onlyOnce: true });
    }, { onlyOnce: true });

    setTimeout(() => setIsLocked(false), 1500); // 1.5秒防手震冷卻
  };

  if (gameState !== 'PLAYING') return <div style={layoutStyle}><h1>等待老師開始...</h1></div>;

  return (
    <div style={{ ...layoutStyle, backgroundColor: isLocked ? '#ccc' : '#1890ff', color: '#fff' }}>
      <button style={bigBtn} onClick={requestGyro}>啟動感應模式</button>
      <h2>目前題目：{currentQ?.term}</h2>
      <p>放在額頭：點頭(正確) / 仰頭(跳過)</p>
      <div style={{marginTop: '20px'}}>
        <button onClick={() => triggerNext('正')} style={smallBtn}>手動正確</button>
        <button onClick={() => triggerNext('跳')} style={smallBtn}>手動跳過</button>
      </div>
    </div>
  );
}

// --- 樣式 ---
const layoutStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center', padding: '20px' };
const bigBtn = { padding: '20px 40px', fontSize: '24px', margin: '10px', cursor: 'pointer', borderRadius: '15px', border: 'none', backgroundColor: '#007bff', color: '#fff' };
const btnStyle = { padding: '15px 30px', fontSize: '20px', cursor: 'pointer' };
const smallBtn = { padding: '10px 20px', margin: '5px', fontSize: '16px' };
const historyBox = { maxHeight: '300px', overflowY: 'auto', margin: '20px', padding: '10px', border: '1px solid #ccc' };