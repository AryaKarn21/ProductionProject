import {
  getDescendantIds,
  getCompanyMap,
  getCompanyTree,
} from '../utils/companyTree.js'
import { can } from './auth.js'

/*
|--------------------------------------------------------------------------
| Group scope
|--------------------------------------------------------------------------
|
| Establishes the set of companies a group-oversight request is allowed to
| read, and refuses everything else.
|
| The rule is deliberately narrow: you see YOUR company and everything
| BELOW it in the hierarchy — never a sibling, never a parent, never the
| whole platform. So an OS Group director sees every child company; the
| head of one child company sees only their own branch; and a company
| with no children gets an empty console rather than a window into
| anybody else's data.
|
| Sets:
|   req.groupRootId   string    the company the scope is rooted at
|   req.groupIds      string[]  root + every descendant (the query filter)
|   req.childIds      string[]  descendants only
|   req.companyMap    Map       id -> { name, type, ... } for labelling
*/
export const resolveGroupScope = async (req, res, next) => {
  try {
    if (!can(req, 'group.view')) {
      return res.status(403).json({
        message: 'You do not have permission to view group oversight.',
        required: 'group.view',
      })
    }

    /*
     * Which company is the scope rooted at?
     *
     * A super admin browsing with no X-Company-ID header has
     * req.companyId === null (that is how resolveCompany signals "all
     * companies"). Rooting at their home company keeps the console
     * meaningful for them too, instead of returning nothing.
     */
    const rootId = req.companyId || req.user.companyId

    /*
     * No company to root the scope at — a super admin whose own
     * companyId was never set, browsing with no X-Company-ID header.
     *
     * This deliberately does NOT 4xx. The Sidebar calls GET /group/scope
     * on every page load to decide whether to show the Group Console
     * menu, and the axios interceptor turns any non-401/403 error into a
     * toast — so returning 400 here would have popped an error on every
     * single navigation for exactly the accounts most likely to hit it.
     * An empty scope is the honest answer, and the UI already renders a
     * clear empty state for it.
     */
    if (!rootId) {
      req.groupRootId = null
      req.groupIds = []
      req.childIds = []
      req.companyMap = new Map()
      req.groupEmpty = true
      return next()
    }

    const childIds = await getDescendantIds(rootId)

    if (childIds.length === 0) {
      // Not an error — this company simply has no children yet. The UI
      // renders a "no child companies" empty state from this flag rather
      // than showing a broken dashboard.
      req.groupRootId = String(rootId)
      req.groupIds = [String(rootId)]
      req.childIds = []
      req.companyMap = await getCompanyMap()
      req.groupEmpty = true
      return next()
    }

    req.groupRootId = String(rootId)
    req.childIds = childIds
    req.groupIds = [String(rootId), ...childIds]
    req.companyMap = await getCompanyMap()
    req.groupEmpty = false

    return next()
  } catch (err) {
    return next(err)
  }
}

/**
 * Narrows an already-resolved group scope to a single company, when the
 * caller passes ?companyId= to drill into one child.
 *
 * Returns the id list to filter on, or null when the requested company
 * is outside the caller's scope — which the route turns into a 403. This
 * is the check that stops ?companyId=<some other tenant> being used to
 * read a company the caller has no relationship with.
 */
export const narrowScope = (req, requestedCompanyId) => {
  if (!requestedCompanyId) return req.groupIds
  const wanted = String(requestedCompanyId)
  return req.groupIds.includes(wanted) ? [wanted] : null
}

export { getCompanyTree }
export default { resolveGroupScope, narrowScope }
