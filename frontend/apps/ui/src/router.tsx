import {createBrowserRouter, Navigate} from "react-router-dom"

import App from "@/app/App.tsx"
import Folder, {loader as folderLoader} from "@/pages/Folder"

import PortalFeedPage from "@/features/portal/pages/PortalFeedPage"
import PortalFolderPage from "@/features/portal/pages/PortalFolderPage"
import PortalHomeRedirect from "@/features/portal/pages/PortalHomeRedirect"
import {RoleDetails, RolesList} from "@/features/roles/pages"
import {TagDetails, TagsList} from "@/features/tags/pages"
import {UserDetails, UsersList} from "@/features/users/pages"
import Document from "@/pages/Document"
import LibraryPage from "@/features/library/pages/LibraryPage"
import SearchPage from "@/pages/Search"
import AuditLogPage from "@/features/audit/pages/AuditLogPage"
import ProfilePage from "@/features/profile/pages/ProfilePage"
import UserGuidePage from "@/features/help/pages/UserGuidePage"
import BackupPage from "@/features/backup/pages/BackupPage"

import {AccessForbidden, NotFound, UnprocessableContent} from "@/pages/errors"

import {loader as documentLoader} from "@/pages/Document"

import ErrorPage from "@/pages/Error.tsx"
import CitizenCategoriesPage from "@/features/citizen_categories/pages/CitizenCategoriesPage"
import CitizenCategoryDetailPage from "@/features/citizen_categories/pages/CitizenCategoryDetailPage"
import PostAuthRedirect from "@/features/auth/PostAuthRedirect"
import {
  ERRORS_403_ACCESS_FORBIDDEN,
  ERRORS_404_RESOURCE_NOT_FOUND,
  ERRORS_422_UNPROCESSABLE_CONTENT
} from "./cconstants"

const router = createBrowserRouter([
  {
    path: "/login",
    element: <PostAuthRedirect />
  },
  {
    path: "/login/",
    element: <PostAuthRedirect />
  },
  // Auth-server redirects here after login. Must be top-level: under RR7 a
  // child `path: "/home"` of `path: "/"` does not match URL "/home" (404).
  {
    path: "/home",
    element: <PostAuthRedirect />
  },
  {
    path: "/home/:folderId",
    element: <PostAuthRedirect />
  },
  {
    path: "/",
    element: <PostAuthRedirect />
  },
  {
    path: "/browse/*",
    element: <Navigate to="/" replace />
  },
  {
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/inbox/:folderId",
        element: <Navigate to="/library/favorites" replace />
      },
      {
        path: "/folder/:folderId",
        element: <Folder />,
        loader: folderLoader
      },
      {
        path: "/document/:documentId",
        element: <Document />,
        loader: documentLoader
      },
      {
        path: "/library",
        element: <Navigate to="/library/favorites" replace />
      },
      {
        path: "/library/:section",
        element: <LibraryPage />
      },
      {
        path: "/search",
        element: <SearchPage />
      },
      {
        path: "/portal",
        element: <PortalHomeRedirect />
      },
      {
        path: "/portal/folder/:folderId",
        element: <PortalFolderPage />
      },
      {
        path: "/portal/feed",
        element: <PortalFeedPage />
      },
      {
        path: "/citizen-categories",
        element: <CitizenCategoriesPage />
      },
      {
        path: "/citizen-categories/:categoryId",
        element: <CitizenCategoryDetailPage />
      },
      {
        path: "/tags",
        element: <TagsList />
      },
      {
        path: "/tags/:tagId",
        element: <TagDetails />
      },
      {
        path: "/roles",
        element: <RolesList />
      },
      {
        path: "/roles/:roleId",
        element: <RoleDetails />
      },
      {
        path: "/users",
        element: <UsersList />
      },
      {
        path: "/users/:userId",
        element: <UserDetails />
      },
      {
        path: "/audit-log",
        element: <AuditLogPage />
      },
      {
        path: "/admin/backup",
        element: <BackupPage />
      },
      {
        path: "/profile",
        element: <ProfilePage />
      },
      {
        path: "/help",
        element: <UserGuidePage />
      },
      {
        path: ERRORS_403_ACCESS_FORBIDDEN,
        element: <AccessForbidden />
      },
      {
        path: ERRORS_404_RESOURCE_NOT_FOUND,
        element: <NotFound />
      },
      {
        path: ERRORS_422_UNPROCESSABLE_CONTENT,
        element: <UnprocessableContent />
      }
    ]
  }
])

export default router
