import { useMemo } from 'react'
import { useAuthStore } from '@/store/auth.store'

export default function useCompanyScope() {
  const user = useAuthStore((s) => s.user)
  const companies = useAuthStore((s) => s.companies)
  const activeCompanyId = useAuthStore((s) => s.activeCompany)

  return useMemo(() => {
    const list = Array.isArray(companies) ? companies : []
    const isSuperAdmin = user?.role === 'super_admin'

    const activeCompany =
      list.find((c) => String(c.id) === String(activeCompanyId)) ||
      list.find((c) => String(c.id) === String(user?.companyId)) ||
      null

    if (!activeCompany) {
      return {
        activeCompany: null,
        isParentCompany: !!isSuperAdmin,
        isChildCompany: !isSuperAdmin,
        isParentSuperAdmin: !!isSuperAdmin,
        isPlatformScope: !!isSuperAdmin,
      }
    }

    const isParentCompany = !activeCompany.parentId

    return {
      activeCompany,
      isParentCompany,
      isChildCompany: !isParentCompany,
      isParentSuperAdmin: isSuperAdmin && isParentCompany,
      isPlatformScope: false,
    }
  }, [user, companies, activeCompanyId])
}
