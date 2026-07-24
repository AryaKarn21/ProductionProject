import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

import { projectsAPI } from '@/api/projects.api'
import { projectSchema } from '@/lib/validations'

export default function ProjectEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(projectSchema),
  })

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsAPI.getById(id).then(res => res.data),
  })

  useEffect(() => {
    if (project) {
      reset({
        name: project.name,
        description: project.description,
        client: project.client,
        startDate: project.startDate?.split('T')[0],
        endDate: project.endDate?.split('T')[0],
        budget: project.budget,
         progress: project.progress,
      })
    }
  }, [project, reset])

  const updateMutation = useMutation({
    mutationFn: (data) => projectsAPI.update(id, data),

    onSuccess: () => {
      toast.success('Project updated successfully')

      queryClient.invalidateQueries({
        queryKey: ['projects'],
      })

      queryClient.invalidateQueries({
        queryKey: ['project', id],
      })

      navigate(`/projects/${id}`)
    },
  })

  if (isLoading) {
    return <div className="p-6">Loading...</div>
  }

  return (
    <div className="animate-fade-in">

      <div className="page-header">

        <div className="flex items-center gap-3">

          <button
            className="btn btn-ghost btn-icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={16} />
          </button>

          <div>
            <h1 className="text-[18px] font-bold">
              Edit Project
            </h1>
            <p className="text-[12px] text-gray-500">
              Update project details
            </p>
          </div>

        </div>

      </div>
        <div className="form-group">
  <label className="form-label">
    Progress (%)
  </label>

  <input
    type="number"
    min="0"
    max="100"
    className="input"
    {...register("progress", {
      valueAsNumber: true,
    })}
  />

  {errors.progress && (
    <p className="text-red-500 text-xs">
      {errors.progress.message}
    </p>
  )}
</div>
      <div className="card p-6 mx-6">

        <form
          className="flex flex-col gap-5"
          onSubmit={handleSubmit((data) =>
            updateMutation.mutate(data)
          )}
        >

          <div className="form-group">
            <label className="form-label">
              Project Name
            </label>

            <input
              className="input"
              {...register('name')}
            />

            {errors.name && (
              <p className="text-red-500 text-xs">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              Description
            </label>

            <textarea
              rows={4}
              className="input"
              {...register('description')}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Client
            </label>

            <input
              className="input"
              {...register('client')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">

            <div className="form-group">
              <label className="form-label">
                Start Date
              </label>

              <input
                type="date"
                className="input"
                {...register('startDate')}
              />

              {errors.startDate && (
                <p className="text-red-500 text-xs">
                  {errors.startDate.message}
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">
                End Date
              </label>

              <input
                type="date"
                className="input"
                {...register('endDate')}
              />

              {errors.endDate && (
                <p className="text-red-500 text-xs">
                  {errors.endDate.message}
                </p>
              )}
            </div>

          </div>

          <div className="form-group">
            <label className="form-label">
              Budget
            </label>

            <input
              type="number"
              className="input"
              {...register('budget')}
            />
          </div>

          <div className="flex justify-end gap-3">

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(-1)}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending
                ? 'Updating...'
                : 'Update Project'}
            </button>

          </div>

        </form>

      </div>

    </div>
  )
}