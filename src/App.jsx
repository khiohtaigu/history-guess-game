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

// --- 投影幕畫面 ---
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
        <h1>結束！得分：{roomData.score}</h1>
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

// --- 手機猜題者組件 (最強感應版) ---
function PlayerView({ roomDataRef }) {
  const [gyroState, setGyroState] = useState('OFF'); // OFF, ON
  const [readyToTrigger, setReadyToTrigger] = useState(true);
  const [angles, setAngles] = useState({ b: 0, g: 0 });
  
  const baseRef = useRef({ b: 0, g: 0 }); // 儲存校正基準點
  const readyRef = useRef(true);

  // 最短路徑演算法：處理 0 變 -179 的問題
  const getDiff = (cur, ref) => {
    let d = cur - ref;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  };

  const handleOrientation = (e) => {
    const b = e.beta || 0;
    const g = e.gamma || 0;
    setAngles({ b: b.toFixed(0), g: g.toFixed(0) });

    if (gyroState !== 'ON') return;

    // 計算相對於校正基準的偏移
    const diffB = getDiff(b, baseRef.current.b);
    const diffG = getDiff(g, baseRef.current.g);

    // 回正判定：兩軸都回到中心區
    if (Math.abs(diffB) < 15 && Math.abs(diffG) < 15) {
      readyRef.current = true;
      setReadyToTrigger(true);
      return;
    }

    // 觸發判定：檢查是否有大於 35 度的位移
    if (!readyRef.current) return;
    const currentData = roomDataRef.current;
    if (!currentData || currentData.state !== 'PLAYING') return;

    // 我們監測變動最大的那一軸
    const maxDiff = Math.abs(diffB) > Math.abs(diffG) ? diffB : diffG;

    if (maxDiff < -35) {
      submitAction('正確'); // 點頭
    } else if (maxDiff > 35) {
      submitAction('跳過'); // 仰頭
    }
  };

  const submitAction = async (type) => {
    readyRef.current = false;
    setReadyToTrigger(false);

    const currentData = roomDataRef.current;
    if (!currentData?.queue) return;

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

  const startGyro = () => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(s => {
        if (s === 'granted') {
          setupListener();
        } else {
          alert("授權失敗，請確保使用 HTTPS 開啟網頁");
        }
      });
    } else {
      setupListener();
    }
  };

  const setupListener = () => {
    // 先移除舊的，再掛上新的
    window.removeEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    
    // 延遲一秒紀錄基準點，給玩家時間放好手機
    setTimeout(() => {
      // 這裡直接抓取當下的原始數值
      setGyroState('ON');
      alert("感應器已就緒！請將手機橫放在額頭平視前方。");
    }, 1000);
  };

  // 當 gyroState 變為 ON 時，抓取一次目前的數值作為基準點
  useEffect(() => {
    if (gyroState === 'ON') {
      baseRef.current = { b: parseFloat(angles.b), g: parseFloat(angles.g) };
    }
  }, [gyroState]);

  return (
    <div style={{ ...layoutStyle, backgroundColor: readyToTrigger ? '#1890ff' : '#444', color: '#fff' }}>
      {gyroState !== 'ON' ? (
        <div style={layoutStyle}>
          <h2>遊戲準備步驟</h2>
          <p>1. 重新整理網頁後需重新授權</p>
          <p>2. 點擊按鈕後，請平視前方</p>
          <button style={btnStyle} onClick={startGyro}>啟動並校正感應器</button>
        </div>
      ) : roomDataRef.current?.state !== 'PLAYING' ? (
        <div style={layoutStyle}>
          <h2>感應器就緒 ✅</h2>
          <p>請等待投影幕端按下「開始回合」</p>
          <div style={debugBox}>
            Beta: {angles.b} | Gamma: {angles.g}<br/>
            基準 B: {baseRef.current.b} | G: {baseRef.current.g}
          </div>
        </div>
      ) : (
        <div style={layoutStyle}>
          <h2 style={{fontSize: '60px'}}>{roomDataRef.current.queue?.[roomDataRef.current.currentIndex]?.term}</h2>
          <p style={{fontSize: '24px', opacity: readyToTrigger ? 1 : 0.3}}>
            {readyToTrigger ? "請點頭或仰頭" : "請回正手機..."}
          </p>
          <div style={debugBox}>
            即時角度: B:{angles.b} G:{angles.g}
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
const debugBox = { position: 'absolute', bottom: '20px', fontSize: '12px', color: '#fff', opacity: 0.5 };
const historyBox = { maxHeight: '50vh', overflowY: 'auto', backgroundColor: '#eee', padding: '20px', borderRadius: '10px', width: '80%', color: '#333', marginTop: '20px', textAlign: 'left' };