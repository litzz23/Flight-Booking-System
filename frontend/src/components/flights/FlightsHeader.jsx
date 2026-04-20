import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import { notifications as notificationsAPI } from "../../api";

const BANNER_SEEN_KEY = "fd_notif_preview_banner_seen_ids";

function readSeenBannerIds() {
  try {
    const raw = sessionStorage.getItem(BANNER_SEEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}

function markBannerSeen(id) {
  try {
    const s = readSeenBannerIds();
    s.add(String(id));
    sessionStorage.setItem(BANNER_SEEN_KEY, JSON.stringify([...s].slice(-200)));
  } catch {
  }
}

function formatWallet(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return "NPR " + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatTimeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function truncateMessage(text, max = 80) {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max).trim() + "…";
}

function getNavigateTarget(n) {
  const type = String(n.type || "");
  const bid = n.related_booking_id != null ? Number(n.related_booking_id) : NaN;
  const bookingHighlight =
    Number.isInteger(bid) && bid > 0 ? { highlightBookingId: bid } : undefined;

  if (type === "wallet_top_up" || type === "wallet_khalti") {
    return { path: "/wallet" };
  }

  return { path: "/bookings", state: bookingHighlight };
}

function toBannerPayload(n) {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    related_booking_id: n.related_booking_id,
    is_read: n.is_read,
  };
}

export default function FlightsHeader({ activeTab = "flights" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, logout } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [deletingNotifId, setDeletingNotifId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 60, left: 16, width: 360 });
  const [bannerNotif, setBannerNotif] = useState(null);
  const wrapRef = useRef(null);
  const bellRef = useRef(null);
  const panelRef = useRef(null);
  const knownNotifIdsRef = useRef(new Set());
  const isFirstFetchRef = useRef(true);

  const updatePanelPosition = useCallback(() => {
    if (!bellRef.current || typeof window === "undefined") return;
    const rect = bellRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 1024;
    const margin = 16;
    const width = Math.min(360, Math.max(260, viewportWidth - margin * 2));
    const left = Math.max(
      margin,
      Math.min(rect.right - width, viewportWidth - width - margin),
    );
    setPanelPos({
      top: Math.round(rect.bottom + 8),
      left: Math.round(left),
      width,
    });
  }, []);

  const showPreviewBanner = useCallback((n) => {
    if (!n) return;
    const seen = readSeenBannerIds();
    if (seen.has(String(n.id))) return;
    markBannerSeen(n.id);
    setBannerNotif(toBannerPayload(n));
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const data = await notificationsAPI.list();
      const list = data.notifications || [];
      const nextUnread = Number(data.unread_count) || 0;

      if (isFirstFetchRef.current) {
        isFirstFetchRef.current = false;
        knownNotifIdsRef.current = new Set(list.map((n) => n.id));
        setNotifications(list);
        setUnreadCount(nextUnread);
        const newestUnread = list.find((n) => !n.is_read);
        if (newestUnread) {
          showPreviewBanner(newestUnread);
        }
        return;
      }

      const prevKnown = knownNotifIdsRef.current;
      const newOnes = list.filter((n) => !prevKnown.has(n.id));
      knownNotifIdsRef.current = new Set(list.map((n) => n.id));

      setNotifications(list);
      setUnreadCount(nextUnread);

      if (newOnes.length > 0) {
        const newest = newOnes.reduce((a, b) =>
          Number(a.id) > Number(b.id) ? a : b,
        );
        showPreviewBanner(newest);
      }
    } catch {
    }
  }, [user, showPreviewBanner]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setBannerNotif(null);
      knownNotifIdsRef.current = new Set();
      isFirstFetchRef.current = true;
      return;
    }
    isFirstFetchRef.current = true;
    knownNotifIdsRef.current = new Set();
    loadNotifications();
    const interval = setInterval(loadNotifications, 30_000);
    return () => clearInterval(interval);
  }, [user, loadNotifications]);

  useEffect(() => {
    if (!user) return;
    const onVis = () => {
      if (document.visibilityState === "visible") loadNotifications();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user, loadNotifications]);

  useEffect(() => {
    if (!bannerNotif) return;
    const timer = setTimeout(() => setBannerNotif(null), 12_000);
    return () => clearTimeout(timer);
  }, [bannerNotif]);

  useEffect(() => {
    if (!bannerNotif) return;
    const onKey = (e) => {
      if (e.key === "Escape") setBannerNotif(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bannerNotif]);

  useEffect(() => {
    if (!panelOpen) return;
    updatePanelPosition();
    const onDown = (e) => {
      const inWrap = wrapRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inWrap && !inPanel) {
        setPanelOpen(false);
      }
    };
    const onViewportChange = () => updatePanelPosition();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [panelOpen, updatePanelPosition]);

  const togglePanel = () => setPanelOpen((o) => !o);

  const dismissBanner = () => setBannerNotif(null);

  const activateNotification = useCallback(
    async (n, { closePanel = true, clearBanner = false } = {}) => {
      if (!n) return;
      try {
        if (!n.is_read) {
          await notificationsAPI.markRead(n.id);
          setNotifications((prev) =>
            prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)),
          );
          setUnreadCount((c) => Math.max(0, c - 1));
        }
      } catch {
      }
      const target = getNavigateTarget(n);
      navigate(target.path, target.state ? { state: target.state } : undefined);
      if (closePanel) setPanelOpen(false);
      if (clearBanner) setBannerNotif(null);
    },
    [navigate],
  );

  const onMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications((prev) => prev.map((x) => ({ ...x, is_read: true })));
      setUnreadCount(0);
    } catch {
    }
  };

  const onDeleteNotification = async (notifId) => {
    if (!notifId || deletingNotifId != null) return;
    setDeletingNotifId(notifId);
    try {
      const removed = notifications.find((x) => x.id === notifId);
      await notificationsAPI.delete(notifId);
      setNotifications((prev) => prev.filter((x) => x.id !== notifId));
      if (removed && !removed.is_read) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      setBannerNotif((prev) => (prev?.id === notifId ? null : prev));
      knownNotifIdsRef.current = new Set(
        [...knownNotifIdsRef.current].filter((id) => id !== notifId),
      );
    } catch {
    } finally {
      setDeletingNotifId(null);
    }
  };

  const panelItems = notifications.slice(0, 10);

  const panelEl =
    typeof document !== "undefined" && panelOpen
      ? createPortal(
          <div
            ref={panelRef}
            className="fd-notif-panel"
            role="menu"
            style={{
              top: `${panelPos.top}px`,
              left: `${panelPos.left}px`,
              width: `${panelPos.width}px`,
            }}
          >
            <div className="fd-notif-panel-head">
              <span className="fd-notif-panel-title">Notifications</span>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  className="fd-notif-mark-all"
                  onClick={onMarkAllRead}
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <ul className="fd-notif-list">
              {panelItems.length === 0 ? (
                <li className="fd-notif-empty">No notifications yet.</li>
              ) : (
                panelItems.map((n) => (
                  <li key={n.id}>
                    <div className="fd-notif-item-wrap">
                      <button
                        type="button"
                        className={`fd-notif-item${n.is_read ? "" : " fd-notif-item-unread"}`}
                        onClick={() =>
                          activateNotification(n, {
                            closePanel: true,
                            clearBanner: false,
                          })
                        }
                      >
                        <span className="fd-notif-item-top">
                          <strong className="fd-notif-item-title">
                            {n.title}
                          </strong>
                          {!n.is_read ? (
                            <span className="fd-notif-dot" aria-label="Unread" />
                          ) : null}
                        </span>
                        <span className="fd-notif-item-msg">
                          {truncateMessage(n.message)}
                        </span>
                        <span className="fd-notif-item-time">
                          {formatTimeAgo(n.created_at)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="fd-notif-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNotification(n.id);
                        }}
                        disabled={deletingNotifId === n.id}
                        aria-label="Delete notification"
                        title="Delete notification"
                      >
                        {deletingNotifId === n.id ? "…" : "×"}
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  const bannerEl =
    typeof document !== "undefined" && user && bannerNotif
      ? createPortal(
          <div
            className="fd-notif-banner-host"
            role="status"
            aria-live="polite"
          >
            <div className="fd-notif-banner-strip">
              <div className="fd-notif-banner-accent" aria-hidden />
              <div className="fd-notif-banner-inner">
                <button
                  type="button"
                  className="fd-notif-banner-main"
                  onClick={() =>
                    activateNotification(bannerNotif, {
                      closePanel: false,
                      clearBanner: true,
                    })
                  }
                >
                  <div className="fd-notif-banner-icon" aria-hidden>
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </div>
                  <div className="fd-notif-banner-text">
                    <strong className="fd-notif-banner-title">
                      {bannerNotif.title}
                    </strong>
                    <span className="fd-notif-banner-msg">
                      {truncateMessage(bannerNotif.message, 160)}
                    </span>
                  </div>
                </button>
                <div className="fd-notif-banner-actions">
                  <button
                    type="button"
                    className="fd-notif-banner-btn"
                    onClick={() =>
                      activateNotification(bannerNotif, {
                        closePanel: false,
                        clearBanner: true,
                      })
                    }
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="fd-notif-banner-close"
                    onClick={dismissBanner}
                    aria-label="Dismiss notification"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {bannerEl}
      {panelEl}
      <header className="fd-header">
        <div className="fd-header-left">
          <span className="fd-logo" onClick={() => navigate("/")}>
            Binayak Airlines
          </span>
          <nav className="fd-header-nav">
            <button
              type="button"
              className={`fd-nav-link ${activeTab === "flights" ? "active" : ""}`}
              onClick={() => navigate("/flights")}
            >
              Flights
            </button>
            <button
              type="button"
              className={`fd-nav-link ${activeTab === "home" ? "active" : ""}`}
              onClick={() => navigate("/")}
            >
              Home
            </button>
          </nav>
        </div>
        <div className="fd-header-actions">
          {loading ? null : user ? (
            <>
              <button
                type="button"
                className="fd-wallet-pill"
                onClick={() => navigate("/wallet")}
                title="Open wallet"
              >
                <span className="fd-wallet-label">Wallet</span>
                <span className="fd-wallet-balance">
                  {formatWallet(user.wallet_balance)}
                </span>
              </button>
              <div className="fd-notif-wrap" ref={wrapRef}>
                <button
                  ref={bellRef}
                  type="button"
                  className="fd-notif-bell"
                  onClick={togglePanel}
                  aria-expanded={panelOpen}
                  aria-label="Notifications"
                >
                  <svg
                    className="fd-notif-bell-icon"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  {unreadCount > 0 ? (
                    <span className="fd-notif-badge">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </button>
              </div>
              <button
                type="button"
                className="fd-nav-btn"
                onClick={() => navigate("/dashboard")}
              >
                Dashboard
              </button>
              <button
                type="button"
                className="fd-nav-btn"
                onClick={() => navigate("/bookings")}
              >
                My Bookings
              </button>
              <button
                type="button"
                className="fd-user-avatar fd-user-avatar-btn"
                onClick={() => navigate("/dashboard/profile")}
                title="Open profile"
                aria-label="Open profile"
              >
                {user.name?.charAt(0)?.toUpperCase()}
              </button>
              <button
                type="button"
                className="fd-nav-btn fd-logout"
                onClick={logout}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              className="fd-nav-btn fd-signin"
              onClick={() =>
                navigate("/auth", {
                  state: {
                    from: {
                      pathname: location.pathname,
                      search: location.search,
                      hash: location.hash,
                    },
                  },
                })
              }
            >
              Sign In
            </button>
          )}
        </div>
      </header>
    </>
  );
}
