import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { LoginPage } from './pages/Login.page';
import { RegisterPage } from './pages/Register.page';

const router = createBrowserRouter([
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '*',
    element: <LoginPage />,
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
