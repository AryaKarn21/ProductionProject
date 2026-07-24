import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Lock, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '@/api/auth.api'

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),

    confirmPassword: z
      .string()
      .min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export default function ResetPassword() {

  const navigate = useNavigate()
  const location = useLocation()

  const email = location.state?.email || ''

  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(schema)
  })

  const onSubmit = async (data) => {

    setLoading(true)

    try {

      await authAPI.resetPassword(
        email,
        data.password
      )

      toast.success('Password changed successfully')

      navigate('/login')

    } catch (err) {

      toast.error(
        err?.response?.data?.message ||
        'Unable to reset password'
      )

    } finally {

      setLoading(false)

    }

  }

  return (

    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-6">

      <div className="w-full max-w-md rounded-xl border p-8 bg-[var(--card-bg)]">

        <div className="flex items-center gap-2 mb-6">

          <Building2 className="text-[var(--primary)]" />

          <h2 className="text-2xl font-bold">
            Reset Password
          </h2>

        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >

          <div>

            <label>New Password</label>

            <div className="relative">

              <Lock size={16} className="absolute left-3 top-3"/>

              <input
                {...register('password')}
                type={showPass ? 'text' : 'password'}
                className="input pl-10 pr-10"
              />

              <button
                type="button"
                className="absolute right-3 top-3"
                onClick={() => setShowPass(!showPass)}
              >
                {showPass ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>

            </div>

            {errors.password &&
              <p className="text-red-500 text-sm">
                {errors.password.message}
              </p>
            }

          </div>

          <div>

            <label>Confirm Password</label>

            <div className="relative">

              <Lock size={16} className="absolute left-3 top-3"/>

              <input
                {...register('confirmPassword')}
                type={showConfirm ? 'text' : 'password'}
                className="input pl-10 pr-10"
              />

              <button
                type="button"
                className="absolute right-3 top-3"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>

            </div>

            {errors.confirmPassword &&
              <p className="text-red-500 text-sm">
                {errors.confirmPassword.message}
              </p>
            }

          </div>

          <button
            className="btn btn-primary w-full"
            disabled={loading}
          >
            {loading
              ? 'Updating Password...'
              : 'Reset Password'}
          </button>

        </form>

      </div>

    </div>

  )

}