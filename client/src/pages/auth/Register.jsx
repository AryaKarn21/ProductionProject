import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Building2, Mail, Lock, User } from "lucide-react";
import { authAPI } from "@/api/auth.api";
import toast from "react-hot-toast";

const schema = z
  .object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export default function Register() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
  });
  const onSubmit = async (data) => {
    setLoading(true);

    try {
      await authAPI.register({
        name: data.name,
        email: data.email,
        password: data.password,
      });

      toast.success("Registration successful! Please verify your email.");

      navigate("/verify-otp", {
        state: {
          email: data.email,
        },
      });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-md rounded-xl border p-8 bg-[var(--card-bg)]">
        <div className="flex items-center gap-2 mb-6">
          <Building2 className="text-[var(--primary)]" />
          <h2 className="text-2xl font-bold">Register</h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label>Name</label>

            <div className="relative">
              <User size={16} className="absolute left-3 top-3" />

              <input
                {...register("name")}
                className="input pl-10"
                placeholder="John Doe"
              />
            </div>

            {errors.name && (
              <p className="text-red-500 text-sm">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label>Email</label>

            <div className="relative">
              <Mail size={16} className="absolute left-3 top-3" />

              <input
                {...register("email")}
                className="input pl-10"
                placeholder="john@gmail.com"
              />
            </div>

            {errors.email && (
              <p className="text-red-500 text-sm">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label>Password</label>

            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3" />

              <input
                {...register("password")}
                type={showPass ? "text" : "password"}
                className="input pl-10 pr-10"
              />

              <button
                type="button"
                className="absolute right-3 top-3"
                onClick={() => setShowPass(!showPass)}
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {errors.password && (
              <p className="text-red-500 text-sm">{errors.password.message}</p>
            )}
          </div>

          <div>
            <label>Confirm Password</label>

            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3" />

              <input
                {...register("confirmPassword")}
                type={showConfirm ? "text" : "password"}
                className="input pl-10 pr-10"
              />

              <button
                type="button"
                className="absolute right-3 top-3"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {errors.confirmPassword && (
              <p className="text-red-500 text-sm">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating Account...
              </span>
            ) : (
              "Register"
            )}
          </button>
        </form>

        <div className="text-center mt-6">
          Already have an account?
          <Link to="/login" className="ml-2 text-[var(--primary)]">
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}
