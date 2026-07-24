import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Building2, Lock, Mail, ArrowRight, Shield, Zap, Globe } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { authAPI } from "@/api/auth.api";
import toast from "react-hot-toast";

const schema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function Login() {
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (data) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await authAPI.login(data);
      setAuth(res.data);
      toast.success(`Welcome back, ${res.data.user.name}!`);
      navigate(from, { replace: true });
    } catch (err) {
      const message = err?.response?.data?.message;
      if (message === "Please verify your email before logging in.") {
        toast.error(message);
        navigate("/verify-otp", { state: { email: data.email } });
        return;
      }
      toast.error(message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      background: "#070b14",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>

      {/* ── Ambient glow background ── */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* Top-left blue glow */}
        <div style={{
          position: "absolute", top: "-120px", left: "-120px",
          width: "600px", height: "600px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,102,255,0.18) 0%, transparent 70%)",
        }} />
        {/* Bottom-right purple glow */}
        <div style={{
          position: "absolute", bottom: "-150px", right: "-100px",
          width: "700px", height: "700px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 70%)",
        }} />
        {/* Center subtle glow */}
        <div style={{
          position: "absolute", top: "40%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: "900px", height: "400px", borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(0,102,255,0.05) 0%, transparent 70%)",
        }} />
        {/* Grid overlay */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }} />
      </div>

      {/* ── Left Panel (hidden on mobile/tablet) ── */}
      <div style={{
        display: "none",
        flex: "0 0 55%",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px 56px",
        position: "relative",
        ...(typeof window !== "undefined" && window.innerWidth >= 1024 ? { display: "flex" } : {}),
      }} className="login-left-panel">
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", opacity: mounted ? 1 : 0, transition: "opacity 0.6s ease" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "linear-gradient(135deg, #0066ff, #6366f1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 24px rgba(0,102,255,0.5)",
          }}>
            <Building2 size={22} color="#fff" />
          </div>
          <div>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: "16px", lineHeight: 1 }}>OS Group CRM</p>
            <p style={{ color: "#4a6080", fontSize: "11px", marginTop: "2px" }}>Enterprise Platform</p>
          </div>
        </div>

        {/* Hero text */}
        <div style={{
          opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.8s ease 0.2s",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            background: "rgba(0,102,255,0.12)", border: "1px solid rgba(0,102,255,0.3)",
            borderRadius: "99px", padding: "6px 14px", marginBottom: "24px",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#0066ff", boxShadow: "0 0 8px #0066ff", display: "inline-block" }} />
            <span style={{ color: "#6fa3ff", fontSize: "12px", fontWeight: 500 }}>Trusted by growing enterprises</span>
          </div>

          <h1 style={{
            color: "#fff", fontSize: "clamp(32px, 3.5vw, 52px)",
            fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.03em",
            marginBottom: "20px",
          }}>
            Manage your entire<br />
            <span style={{
              background: "linear-gradient(90deg, #0066ff, #a78bfa)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>business</span> from<br />one place
          </h1>

          <p style={{ color: "#6b7fa3", fontSize: "16px", lineHeight: 1.7, maxWidth: "420px" }}>
            Multi-company CRM, HR, Finance, Inventory and more — unified in a single enterprise platform built for scale.
          </p>
        </div>

        {/* Feature cards */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px",
          opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.8s ease 0.4s",
        }}>
          {[
            { icon: <Zap size={18} color="#0066ff" />, val: "15+", label: "Modules", glow: "rgba(0,102,255,0.15)" },
            { icon: <Globe size={18} color="#a78bfa" />, val: "Multi", label: "Company", glow: "rgba(167,139,250,0.15)" },
            { icon: <Shield size={18} color="#34d399" />, val: "Real-time", label: "Analytics", glow: "rgba(52,211,153,0.15)" },
          ].map(({ icon, val, label, glow }) => (
            <div key={label} style={{
              borderRadius: "16px", padding: "20px 16px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(10px)",
              transition: "all 0.2s ease",
              cursor: "default",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = glow; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
            >
              <div style={{ marginBottom: "10px" }}>{icon}</div>
              <p style={{ color: "#fff", fontWeight: 700, fontSize: "18px" }}>{val}</p>
              <p style={{ color: "#4a6080", fontSize: "12px", marginTop: "2px" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Panel (form) ── */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        position: "relative",
      }}>
        <div style={{
          width: "100%",
          maxWidth: "420px",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(24px)",
          transition: "all 0.7s ease 0.1s",
        }}>

          {/* Mobile logo */}
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            marginBottom: "32px", justifyContent: "center",
          }} className="login-mobile-logo">
            <div style={{
              width: "40px", height: "40px", borderRadius: "11px",
              background: "linear-gradient(135deg, #0066ff, #6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 20px rgba(0,102,255,0.45)",
            }}>
              <Building2 size={20} color="#fff" />
            </div>
            <div>
              <p style={{ color: "#fff", fontWeight: 700, fontSize: "15px" }}>OS Group CRM</p>
              <p style={{ color: "#4a6080", fontSize: "11px" }}>Enterprise Platform</p>
            </div>
          </div>

          {/* Card */}
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: "24px",
            padding: "clamp(28px, 5vw, 44px)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 0 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Card inner glow top */}
            <div style={{
              position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
              width: "60%", height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(0,102,255,0.6), transparent)",
            }} />

            {/* Heading */}
            <div style={{ marginBottom: "32px" }}>
              <h2 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, marginBottom: "6px", letterSpacing: "-0.02em" }}>
                Sign in to your account
              </h2>
              <p style={{ color: "#4a6080", fontSize: "13px" }}>
                Enter your credentials to access the platform
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

              {/* Email */}
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                <label style={{ color: "#8a9ab8", fontSize: "12px", fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase" }}>
                  Email Address
                </label>
                <div style={{ position: "relative" }}>
                  <Mail size={15} style={{
                    position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#4a6080",
                  }} />
                  <input
                    {...register("email")}
                    autoFocus
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    style={{
                      width: "100%", padding: "12px 14px 12px 40px",
                      fontSize: "14px", background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${errors.email ? "#ef4444" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: "12px", color: "#e2e8f0", outline: "none",
                      transition: "all 0.2s ease",
                      boxSizing: "border-box",
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "#0066ff";
                      e.target.style.boxShadow = "0 0 0 3px rgba(0,102,255,0.2), 0 0 20px rgba(0,102,255,0.1)";
                      e.target.style.background = "rgba(0,102,255,0.06)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = errors.email ? "#ef4444" : "rgba(255,255,255,0.1)";
                      e.target.style.boxShadow = "none";
                      e.target.style.background = "rgba(255,255,255,0.05)";
                    }}
                  />
                </div>
                {errors.email && <p style={{ color: "#ef4444", fontSize: "11px" }}>{errors.email.message}</p>}
              </div>

              {/* Password */}
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                <label style={{ color: "#8a9ab8", fontSize: "12px", fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase" }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <Lock size={15} style={{
                    position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#4a6080",
                  }} />
                  <input
                    {...register("password")}
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    style={{
                      width: "100%", padding: "12px 44px 12px 40px",
                      fontSize: "14px", background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${errors.password ? "#ef4444" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: "12px", color: "#e2e8f0", outline: "none",
                      transition: "all 0.2s ease",
                      boxSizing: "border-box",
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "#0066ff";
                      e.target.style.boxShadow = "0 0 0 3px rgba(0,102,255,0.2), 0 0 20px rgba(0,102,255,0.1)";
                      e.target.style.background = "rgba(0,102,255,0.06)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = errors.password ? "#ef4444" : "rgba(255,255,255,0.1)";
                      e.target.style.boxShadow = "none";
                      e.target.style.background = "rgba(255,255,255,0.05)";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    style={{
                      position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: "#4a6080", padding: 0,
                      display: "flex", alignItems: "center",
                    }}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && <p style={{ color: "#ef4444", fontSize: "11px" }}>{errors.password.message}</p>}
              </div>

              {/* Forgot password */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "-8px" }}>
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#6fa3ff", fontSize: "12px", fontWeight: 500, padding: 0,
                  }}
                  onMouseEnter={e => e.target.style.color = "#0066ff"}
                  onMouseLeave={e => e.target.style.color = "#6fa3ff"}
                >
                  Forgot Password?
                </button>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%", padding: "13px 24px",
                  background: loading ? "rgba(0,102,255,0.5)" : "linear-gradient(135deg, #0066ff, #6366f1)",
                  border: "none", borderRadius: "12px", cursor: loading ? "not-allowed" : "pointer",
                  color: "#fff", fontSize: "14px", fontWeight: 600,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  transition: "all 0.2s ease",
                  boxShadow: loading ? "none" : "0 0 30px rgba(0,102,255,0.4), 0 4px 15px rgba(0,0,0,0.3)",
                  letterSpacing: "0.01em",
                  marginTop: "4px",
                }}
                onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(0,102,255,0.55), 0 6px 20px rgba(0,0,0,0.3)"; }}}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = loading ? "none" : "0 0 30px rgba(0,102,255,0.4), 0 4px 15px rgba(0,0,0,0.3)"; }}
              >
                {loading ? (
                  <>
                    <span style={{
                      width: "16px", height: "16px",
                      border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
                      borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block",
                    }} />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              {/* Register link */}
              <p style={{ textAlign: "center", color: "#4a6080", fontSize: "13px", marginTop: "4px" }}>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#6fa3ff", fontWeight: 600, fontSize: "13px", padding: 0,
                  }}
                  onMouseEnter={e => e.target.style.color = "#0066ff"}
                  onMouseLeave={e => e.target.style.color = "#6fa3ff"}
                >
                  Register
                </button>
              </p>
            </form>
          </div>

          {/* Bottom trust badges */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "20px", marginTop: "24px",
          }}>
            {["256-bit Encryption", "SOC 2 Ready", "99.9% Uptime"].map(t => (
              <span key={t} style={{ color: "#2d3f58", fontSize: "11px", display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ color: "#1e3a5f" }}>✓</span> {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Responsive CSS */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .login-left-panel { display: none !important; }
        .login-mobile-logo { display: flex !important; }

        @media (min-width: 1024px) {
          .login-left-panel { display: flex !important; }
          .login-mobile-logo { display: none !important; }
        }

        input::placeholder { color: #2d4060 !important; }
      `}</style>
    </div>
  );
}