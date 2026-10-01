import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('shows device-local sign-in and account creation', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /create an account/i }));
  expect(screen.getByRole('heading', { name: /create your library/i })).toBeInTheDocument();
});
