import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { setSocketId, tokenStore } from '../api/client';
import { useAuth } from './AuthContext';

const SocketContext = createContext({ socket: null, connected: false });

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    const s = io(import.meta.env.VITE_SOCKET_URL || undefined, {
      auth: (cb) => cb({ token: tokenStore.get() }),
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    const onConnect = () => {
      setSocketId(s.id);
      setConnected(true);
    };
    const onDisconnect = () => {
      setSocketId(null);
      setConnected(false);
    };
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onDisconnect);
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
      setSocketId(null);
      setConnected(false);
    };
  }, [user]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSocket = () => useContext(SocketContext);
