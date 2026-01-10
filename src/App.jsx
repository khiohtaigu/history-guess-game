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
    return <div style={layoutStyle}><h1>準備開始遊戲</h1><button style={btnStyle} onClick={startGame}>開始新回合</button></div>;
  }

  if (roomData.state === 'ENDED') {
    return (
      <div style={layoutStyle}>
        <h1 style={{fontSize: '60px'}}>結束！得分：{roomData.score}</h1>
        <div style={historyBox}>
          {roomData.history?.map((h, i) => (<div key={i} style={{fontSize: '24px', margin: '5px'}}>● {h.q} ({h.type})</div>))}
        </div>
        <button style={btnStyle} onClick={startGame}>再玩一局</button>
      </div>
    );
  }

  const currentQ = roomData.queue?.[roomData.currentIndex];
  return (
    <div style={{ ...layoutStyle, backgroundColor: '#000', color: '#fff' }}>
      <div style={{ fontSize: '40px', position: 'absolute', top: '20px' }}>時間：{roomData.timeLeft}s | 分數：{roomData.score}</div>
      <h1 style={{ fontSize: '180px', margin: '20px 0' }}>{currentQ?.term}</h1>
      <p style={{ fontSize: '40px', color: '#888' }}>主題：{currentQ?.category}</p>
    </div>
  );
}

// --- 手機猜題者組件 (精準判定版) ---
function PlayerView({ roomDataRef }) {
  const [isGyroEnabled, setIsGyroEnabled] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [readyToTrigger, setReadyToTrigger] = useState(true);
  const [displayAngle, setDisplayAngle] = useState(0);
  
  const offsetRef = useRef(0); 
  const readyRef = useRef(true);

  // 核心演算法：計算最短角度差，解決 0 變 -179 的跳轉問題
  const getShortestDiff = (current, reference) => {
    let diff = current - reference;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff;
  };

  const handleMotion = (e) => {
    const rawBeta = e.beta;
    
    // 如果尚未校正，紀錄第一秒的角度為基準
    if (!isCalibrated) {
      offsetRef.current = rawBeta;
      setIsCalibrated(true);
      return;
    }

    // 計算相對角度 (使用最短路徑邏輯)
    const relativeBeta = getShortestDiff(rawBeta, offsetRef.current);
    setDisplayAngle(relativeBeta.toFixed(1));

    // 1. 回正判定 (Neutral Zone: -20 到 20 度)
    if (Math.abs(relativeBeta) < 20) {
      readyRef.current = true;
      setReadyToTrigger(true);
      return;
    }

    // 2. 觸發判定 (必須在 Playing 狀態且已準備好)
    const currentData = roomDataRef.current;
    if (!readyRef.current || !currentData || currentData.state !== 'PLAYING') return;

    // 動作判定門檻 (可根據靈敏度微調)
    if (relativeBeta < -40) { 
      submitAction('正確'); // 點頭 (負數方向)
    } else if (relativeBeta > 40) { 
      submitAction('跳過'); // 仰頭 (正數方向)
    }
  };

  const submitAction = async (type) => {
    readyRef.current = false;
    setReadyToTrigger(false);

    const currentData = roomDataRef.current;
    if (!currentData || !currentData.queue) return;

    const nextIndex = currentData.currentIndex + 1;
    const currentQ = currentData.queue[currentData.currentIndex];
    const newHistory = [...(currentData.history || []), { q: currentQ.term, type: type }];
    
    await update(ref(db, `rooms/${ROOM_ID}`), {
      currentIndex: nextIndex,
      score: type === '正確' ? currentData.score + 1 : currentData.score,
      history: newHistory,
      state: nextIndex >= currentData.queue.length ? 'ENDED' : 'PLAYING'
    });
  };

  const enableGyro = () => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(s => {
        if (s === 'granted') {
          window.addEventListener('deviceorientation', handleMotion, true);
          setIsGyroEnabled(true);
        }
      });
    } else {
      window.addEventListener('deviceorientation', handleMotion, true);
      setIsGyroEnabled(true);
    }
  };

  // UI：不管遊戲是否開始，只要感應器沒啟動就顯示啟動按鈕
  return (
    <div style={{ ...layoutStyle, backgroundColor: readyToTrigger ? '#1890ff' : '#444', color: '#fff' }}>
      {!isGyroEnabled ? (
        <div style={layoutStyle}>
          <h2>第一步：準備感應器</h2>
          <p>請點擊按鈕後將手機橫放額頭平視前方</p>
          <button style={btnStyle} onClick={enableGyro}>啟動並校正感應器</button>
        </div>
      ) : roomDataRef.current?.state !== 'PLAYING' ? (
        <div style={layoutStyle}>
          <h2>感應器已就緒 ✅</h2>
          <p>等待電腦端點擊「開始遊戲」...</p>
          <div style={{fontSize: '12px'}}>相對角度: {displayAngle}°</div>
        </div>
      ) : (
        <div style={layoutStyle}>
          <h2 style={{fontSize: '54px'}}>{roomDataRef.current.queue?.[roomDataRef.current.currentIndex]?.term}</h2>
          <p style={{marginTop: '30px', fontSize: '20px'}}>
            {readyToTrigger ? "手機放在額頭 (螢幕朝前)" : "已跳轉！請回正手機..."}
          </p>
          <div style={{position: 'absolute', bottom: '20px', fontSize: '14px'}}>
            相對角度: {displayAngle}° | 點頭(負) 仰頭(正)
          </div>
          <div style={{marginTop: '40px', display: 'flex', gap: '20px'}}>
            <button style={smallBtn} onClick={() => submitAction('正確')}>正確</button>
            <button style={smallBtn} onClick={() => submitAction('跳過')}>跳過</button>
          </div>
        </div>
      )}
    </div>
  );
}

const layoutStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center', padding: '20px', overflow: 'hidden' };
const bigBtn = { padding: '25px 50px', fontSize: '24px', margin: '15px', borderRadius: '15px', border: 'none', backgroundColor: '#1890ff', color: '#fff', cursor: 'pointer' };
const btnStyle = { padding: '15px 40px', fontSize: '20px', borderRadius: '10px', cursor: 'pointer', border: 'none', backgroundColor: '#28a745', color: '#fff' };
const smallBtn = { padding: '20px 30px', fontSize: '20px', borderRadius: '10px', border: 'none', backgroundColor: 'rgba(255,255,255,0.3)', color: '#fff' };
const historyBox = { maxHeight: '50vh', overflowY: 'auto', backgroundColor: '#eee', padding: '20px', borderRadius: '10px', width: '80%', color: '#333', marginTop: '20px', textAlign: 'left' };