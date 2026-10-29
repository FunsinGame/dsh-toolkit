using System;
using System.Drawing;
using System.Windows.Forms;

namespace ExplorerStateKeeper
{
    internal static class WindowGeometry
    {
        public static Rectangle Sanitize(Rectangle rectangle)
        {
            Rectangle virtualScreen;
            try
            {
                virtualScreen = SystemInformation.VirtualScreen;
            }
            catch
            {
                return rectangle;
            }

            if (virtualScreen.Width <= 0 || virtualScreen.Height <= 0)
            {
                return rectangle;
            }

            if (rectangle.Width < 200 || rectangle.Height < 120)
            {
                return DefaultRectangle();
            }

            // A window spanning more than the whole desktop is almost always
            // the result of a monitor layout change.
            if (rectangle.Width > virtualScreen.Width)
            {
                rectangle.Width = virtualScreen.Width;
            }
            if (rectangle.Height > virtualScreen.Height)
            {
                rectangle.Height = virtualScreen.Height;
            }

            if (rectangle.Right > virtualScreen.Right)
            {
                rectangle.X = virtualScreen.Right - rectangle.Width;
            }
            if (rectangle.Bottom > virtualScreen.Bottom)
            {
                rectangle.Y = virtualScreen.Bottom - rectangle.Height;
            }
            if (rectangle.Left < virtualScreen.Left)
            {
                rectangle.X = virtualScreen.Left;
            }
            if (rectangle.Top < virtualScreen.Top)
            {
                rectangle.Y = virtualScreen.Top;
            }

            if (HasUsableTitleBar(rectangle))
            {
                return rectangle;
            }

            Rectangle work = PrimaryWorkingArea();
            int width = Math.Min(rectangle.Width, Math.Max(480, work.Width - 60));
            int height = Math.Min(rectangle.Height, Math.Max(320, work.Height - 60));
            return new Rectangle(
                work.Left + Math.Max(0, (work.Width - width) / 2),
                work.Top + Math.Max(0, (work.Height - height) / 2),
                width,
                height);
        }

        public static Rectangle DefaultRectangle()
        {
            Rectangle work = PrimaryWorkingArea();
            int width = Math.Min(1100, Math.Max(520, work.Width - 120));
            int height = Math.Min(760, Math.Max(360, work.Height - 100));
            return new Rectangle(
                work.Left + Math.Max(0, (work.Width - width) / 2),
                work.Top + Math.Max(0, (work.Height - height) / 2),
                width,
                height);
        }

        public static Rectangle OffsetForTab(Rectangle rectangle, int index)
        {
            if (index <= 0)
            {
                return rectangle;
            }

            int offset = 34 * index;
            Rectangle shifted = rectangle;
            shifted.Offset(offset, offset);

            Rectangle virtualScreen;
            try
            {
                virtualScreen = SystemInformation.VirtualScreen;
            }
            catch
            {
                return shifted;
            }

            if (shifted.Right > virtualScreen.Right || shifted.Bottom > virtualScreen.Bottom)
            {
                shifted = rectangle;
                shifted.Offset(-Math.Min(offset, 180), -Math.Min(offset, 120));
            }

            return Sanitize(shifted);
        }

        public static int NormalizeShowCommand(int command)
        {
            if (command == NativeMethods.SW_SHOWMINIMIZED ||
                command == NativeMethods.SW_SHOWMAXIMIZED)
            {
                return command;
            }
            return NativeMethods.SW_SHOWNORMAL;
        }

        private static Rectangle PrimaryWorkingArea()
        {
            try
            {
                Screen screen = Screen.PrimaryScreen;
                if (screen != null)
                {
                    return screen.WorkingArea;
                }
            }
            catch
            {
                // Fall through.
            }

            return new Rectangle(0, 0, 1280, 800);
        }

        private static bool HasUsableTitleBar(Rectangle rectangle)
        {
            try
            {
                Screen[] screens = Screen.AllScreens;
                for (int i = 0; i < screens.Length; i++)
                {
                    Rectangle work = screens[i].WorkingArea;
                    Rectangle intersection = Rectangle.Intersect(work, rectangle);
                    if (intersection.Width >= 90 && intersection.Height >= 35)
                    {
                        // Make sure the title bar itself (not just the lower
                        // part of the window) can be reached.
                        if (rectangle.Top >= work.Top - 10 &&
                            rectangle.Top <= work.Bottom - 35)
                        {
                            return true;
                        }
                    }
                }
            }
            catch
            {
                return true;
            }

            return false;
        }
    }
}
