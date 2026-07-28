import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
// CORRECT — valid names in lucide-react v1
import {
  LayoutDashboard, Users, TrendingUp, Calendar, DollarSign,
  Package, ShoppingCart, FolderKanban, Headphones,
  BarChart3, Settings, ChevronDown, ChevronRight, Building2, Menu, X,
  Network
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useUIStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { cn, getInitials } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useIsMobile'
import CompanySwitcher from './CompanySwitcher'
import usePermission from '@/hooks/usePermission'
import { groupAPI } from '@/api/group.api'

const NAV = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    to: '/',
    permission: 'dashboard.view',
  },

  {
    label: 'CRM & Sales',
    icon: TrendingUp,
    children: [
      {
        label: 'Leads',
        to: '/crm/leads',
        permission: 'leads.view',
      },
      {
        label: 'Accounts',
        to: '/crm/accounts',
        permission: 'accounts.view',
      },
      {
        label: 'Contacts',
        to: '/crm/contacts',
        permission: 'contacts.view',
      },
      {
        label: 'Opportunities',
        to: '/crm/opportunities',
        permission: 'opportunities.view',
      },
    ],
  },

  {
    label: 'Calendar & Meetings',
    icon: Calendar,
    children: [
      {
        label: 'Calendar',
        to: '/calendar',
        permission: 'calendar.view',
      },
    ],
  },
  {
    label: 'Human Resources',
    icon: Users,
    children: [
      {
        label: 'Employees',
        to: '/hr/employees',
        permission: 'employees.view',
      },
      {
        label: 'Attendance',
        to: '/hr/attendance',
        permission: 'attendance.view',
      },
      {
        label: 'Holidays',
        to: '/hr/attendance/holidays',
        permission: 'attendance.view',
      },
      {
        label: 'Leave Management',
        to: '/hr/leaves',
        permission: 'leave.view',
      },
      {
        label: 'Payroll',
        to: '/hr/payroll',
        permission: 'payroll.view',
      },
    ],
  },

  {
    label: 'Finance',
    icon: DollarSign,
    children: [
      {
        label: 'Overview',
        to: '/finance',
        permission: 'finance.view',
      },
      {
        label: 'Expenses',
        to: '/finance/expenses',
        permission: 'expenses.view',
      },
      {
        label: 'General Ledger',
        to: '/finance/ledger',
        permission: 'ledger.view',
      },
    ],
  },

  {
    label: 'Inventory',
    icon: Package,
    children: [
      {
        label: 'Items',
        to: '/inventory',
        permission: 'inventory.view',
      },
      {
        label: 'Warehouses',
        to: '/inventory/warehouses',
        permission: 'warehouse.view',
      },
      {
        label: 'Assets',
        to: '/inventory/assets',
        permission: 'assets.view',
      },
      {
        label: 'Stock Transfers',
        to: '/inventory/transfers',
        permission: 'transfers.view',
      },
      {
        label: 'Stock Adjustments',
        to: '/inventory/adjustments',
        permission: 'adjustments.view',
      },
    ],
  },

  {
    label: 'Procurement',
    icon: ShoppingCart,
    to: '/procurement',
    permission: 'procurement.view',
  },

  {
    label: 'Projects',
    icon: FolderKanban,
    to: '/projects',
    permission: 'projects.view',
  },

  {
    label: 'Support',
    icon: Headphones,
    to: '/support',
    permission: 'support.view',
  },

  {
    label: 'Analytics',
    icon: BarChart3,
    to: '/reports',
    permission: 'analytics.view',
  },

  /*
   * Group Console — parent-company oversight.
   *
   * `groupOnly` is checked in addition to the permission: the menu is
   * hidden for a company with no children, because the console would
   * have nothing to show. See the useQuery in Sidebar() below.
   */
  {
    label: 'Group Console',
    icon: Network,
    groupOnly: true,
    children: [
      {
        label: 'Overview',
        to: '/group',
        permission: 'group.view',
        // Without this every /group/* route would also light up
        // "Overview", since NavLink matches by prefix by default.
        exact: true,
      },
      {
        label: 'Group Activity',
        to: '/group/activity',
        permission: 'group.view',
      },
      {
        label: 'Group Structure',
        to: '/group/structure',
        permission: 'group.view',
      },
    ],
  },

  {
    label: 'Settings',
    icon: Settings,
    to: '/settings',
    permission: 'settings.view',
  },
]

function NavGroup({ item, collapsed }) {
  const location = useLocation()
  const isActive = item.children?.some(c => location.pathname.startsWith(c.to))
  const [open, setOpen] = useState(isActive)

  if (collapsed) {
    return (
      <div className="relative group">
        <button className={cn('nav-item w-full justify-center', isActive && 'active')}>
          <item.icon className="nav-icon" />
        </button>
        <div className="absolute left-full top-0 ml-2 hidden group-hover:block z-50 bg-[var(--sidebar-bg)] border border-[var(--sidebar-hover-bg)] rounded-lg py-1 min-w-[160px] shadow-lg">
          <div className="px-3 py-2 text-[11px] font-semibold text-[var(--sidebar-text)] uppercase tracking-wider">{item.label}</div>
          {item.children.map(child => (
            <NavLink key={child.to} to={child.to}
              className={({ isActive }) => cn('block px-3 py-2 text-[13px] transition-colors', isActive ? 'text-white bg-[var(--sidebar-active-bg)]' : 'text-[var(--sidebar-text)] hover:text-white hover:bg-[var(--sidebar-hover-bg)]')}
            >{child.label}</NavLink>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn('nav-item w-full', isActive && !open && 'text-white')}
      >
        <item.icon className="nav-icon" />
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="ml-4 mt-0.5 border-l border-white/10 pl-3 flex flex-col gap-0.5">
          {item.children.map(child => (
            <NavLink key={child.to} to={child.to} end={child.exact}
              className={({ isActive }) => cn('nav-item', isActive && 'active')}
            >{child.label}</NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, closeMobileSidebar, toggleMobileSidebar } = useUIStore()
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const location = useLocation()
  const { hasPermission, isSuperAdmin } = usePermission()

  /*
   * Does the active company actually have child companies?
   *
   * Only asked when the user holds group.view, so nobody else pays for
   * the request. A super admin always sees the menu even when the answer
   * is no, because they are the one who sets up the hierarchy and would
   * otherwise have no way to reach the screen that explains how.
   */
  const { data: groupScope } = useQuery({
    queryKey: ['group-scope'],
    queryFn: () => groupAPI.getScope().then((r) => r.data),
    enabled: hasPermission('group.view'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const showGroupConsole =
    hasPermission('group.view') && (isSuperAdmin || (groupScope?.childCount ?? 0) > 0)

  const filteredNav = NAV.reduce((result, item) => {
    if (item.groupOnly && !showGroupConsole) return result

    // Single menu item (Dashboard, Procurement, etc.)
    if (!item.children) {
      if (hasPermission(item.permission)) {
        result.push(item)
      }
      return result
    }

    // Menu group (CRM, HR, Finance...)
    const children = item.children.filter(child =>
      hasPermission(child.permission)
    )

    // Only show group if at least one child is visible
    if (children.length > 0) {
      result.push({
        ...item,
        children,
      })
    }

    return result
  }, [])

  // Close the drawer on every navigation instead of leaving it open over
  // the new page — the previous version had no mobile awareness at all,
  // so it never closed (or opened) for any route change.
  useEffect(() => {
    if (isMobile) closeMobileSidebar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isMobile])

  // On mobile the sidebar is a full-width-ish overlay drawer, not a
  // permanent column: it always renders expanded (icon-only collapse is
  // a desktop-only affordance) and slides in/out instead of resizing.
  const collapsed = isMobile ? false : sidebarCollapsed

  return (
    <>
      {/* Floating hamburger trigger — mobile only. Topbar already reserves
          left padding for this so they never overlap. */}
      {isMobile && (
        <button
          onClick={toggleMobileSidebar}
          aria-label={mobileSidebarOpen ? 'Close menu' : 'Open menu'}
          className="fixed top-2.5 left-3 z-40 w-9 h-9 rounded-lg flex items-center justify-center shadow-sm"
          style={{ background: 'var(--sidebar-bg)', color: '#fff' }}
        >
          {mobileSidebarOpen ? <X size={17} /> : <Menu size={17} />}
        </button>
      )}

      {/* Backdrop — click to dismiss */}
      {isMobile && mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 animate-fade-in"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        className="fixed left-0 top-0 h-screen flex flex-col transition-transform duration-300 z-30 overflow-hidden"
        style={{
          width: isMobile ? 'min(80vw, var(--sidebar-width))' : (collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)'),
          background: 'var(--sidebar-bg)',
          transform: isMobile && !mobileSidebarOpen ? 'translateX(-100%)' : 'translateX(0)',
          transition: isMobile ? 'transform 0.25s ease' : 'width 0.3s ease',
        }}
      >
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center flex-shrink-0">
            <Building2 size={16} className="text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-white text-[13px] font-700 leading-tight truncate">OS Group CRM</p>
              <p className="text-[var(--sidebar-text)] text-[10px] truncate">Enterprise Platform</p>
            </div>
          )}
          {!isMobile && (
            <button
              onClick={toggleSidebar}
              className="ml-auto text-[var(--sidebar-text)] hover:text-white transition-colors p-1 rounded flex-shrink-0"
              aria-label="Toggle sidebar width"
            >
              <Menu size={15} />
            </button>
          )}
        </div>

        {/* Company Switcher */}
        {!collapsed && <CompanySwitcher />}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-0.5 scrollbar-none">
          {filteredNav.map((item) =>
            item.children ? (
              <NavGroup key={item.label} item={item} collapsed={collapsed} />
            ) : (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}
                className={({ isActive }) => cn('nav-item', isActive && 'active', collapsed && 'justify-center')}
              >
                <item.icon className="nav-icon" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            )
          )}
        </nav>

        {/* User footer */}
        <div className={cn('border-t border-white/10 p-3 flex items-center gap-3', collapsed && 'justify-center')}>
          <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            {getInitials(user?.name || 'U')}
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-white text-[12px] font-medium truncate">{user?.name}</p>
              <p className="text-[var(--sidebar-text)] text-[11px] truncate capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}