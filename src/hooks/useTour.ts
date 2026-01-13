import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useTranslation } from 'react-i18next';

/**
 * Hook to manage the guided tour using driver.js
 * 
 * To add or update steps:
 * 1. Define a unique ID selector for the target element in the TSX (e.g., id="my-new-feature")
 * 2. Add a new object to the `steps` array below.
 * 3. Add title and description translation keys to i18n files.
 * 
 * Step configuration format:
 * {
 *   element: '#selector-id',
 *   popover: {
 *     title: t('tour.step.title'),
 *     description: t('tour.step.description'),
 *     side: "bottom", // "top", "bottom", "left", "right"
 *     align: 'start' // "start", "center", "end"
 *     align: 'start' // "start", "center", "end"
 *   }
 * }
 */
export const useTour = (setActiveTab: (tab: string) => void) => {
  const { t } = useTranslation();
  const driverObj = useRef<ReturnType<typeof driver> | null>(null);

  useEffect(() => {
    const steps: DriveStep[] = [
      {
        element: '#app-header',
        popover: {
          title: t('tour.welcome.title', 'Welcome to AirShare'),
          description: t('tour.welcome.description', 'Your secure, local cross-platform file sharing solution.'),
          side: "bottom",
          align: 'start',
          showButtons: ['next', 'close']
        }
      },
      {
        element: '#tab-transfer',
        popover: {
          title: t('tour.transfer.title', 'Transfer'),
          description: t('tour.transfer.description', 'Send files to other devices quickly.'),
          side: "bottom",
          align: 'start',
          onNextClick: () => {
             setActiveTab('transfer');
             setTimeout(() => {
                 driverObj.current?.moveNext();
             }, 400);
          }
        }
      },
      {
        element: '#file-drop-zone',
        popover: {
            title: t('tour.dropzone.title', 'Send Files'),
            description: t('tour.dropzone.description', 'Drag and drop files here to start sharing.'),
            side: "right",
            align: 'start'
        }
      },
      {
        element: '#tab-devices',
        popover: {
          title: t('tour.devices.title', 'Devices'),
          description: t('tour.devices.description', 'See online devices and manage trusted connections.'),
          side: "bottom",
          align: 'start',
          onNextClick: () => {
            setActiveTab('devices');
            setTimeout(() => {
                driverObj.current?.moveNext();
            }, 400);
          }
        }
      },
      {
        element: '#device-list-container',
        popover: {
            title: t('tour.devicelist.title', 'Device List'),
            description: t('tour.devicelist.description', 'All detected devices on your network appear here. Click to send files to them.'),
            side: "top",
            align: 'center'
        }
      },
      {
          element: '#tab-history',
          popover: {
            title: t('tour.history.title', 'History'),
            description: t('tour.history.description', 'View your recent transfers and statistics.'),
            side: "bottom",
            align: 'start',
             onNextClick: () => {
                setActiveTab('history');
                setTimeout(() => {
                    driverObj.current?.moveNext();
                }, 400);
             }
          }
      },
      {
        element: '#history-list',
        popover: {
            title: t('tour.historylist.title', 'Transfer Log'),
            description: t('tour.historylist.description', 'Review past transfers, statuses, and manage records.'),
            side: "top",
            align: 'center'
        }
      },
      {
          element: '#tab-settings',
          popover: {
            title: t('tour.settings.title', 'Settings'),
            description: t('tour.settings.description', 'Configure language, theme, and other preferences.'),
            side: "bottom",
            align: 'start',
            onNextClick: () => {
                setActiveTab('settings');
                setTimeout(() => {
                    driverObj.current?.moveNext();
                }, 400);
            }
          }
      },
      {
          element: '#appearance-settings',
          popover: {
              title: t('tour.appearance.title', 'Appearance'),
              description: t('tour.appearance.description', 'Customize the look and feel, including Dark Mode.'),
              side: "left",
              align: 'start'
          }
      },
       {
          element: '#start-tour-btn',
          popover: {
            title: t('tour.help.title', 'Need Help?'),
            description: t('tour.help.description', 'Click here to restart this tour anytime.'),
            side: "bottom",
            align: 'end'
          }
      }
    ];

    driverObj.current = driver({
      showProgress: true,
      animate: true,
      steps: steps,
      nextBtnText: t('common.next', 'Next'),
      prevBtnText: t('common.prev', 'Previous'),
      doneBtnText: t('common.done', 'Done'),
      popoverClass: 'driverjs-theme',
      onDestroyed: () => {
         localStorage.setItem('tour_completed', 'true');
         setActiveTab('transfer');
      },
    });
  }, [t, setActiveTab]);

  const startTour = () => {
    const el = document.getElementById('tab-transfer');
    if(el) el.click();

    setTimeout(() => {
        if (driverObj.current) {
            driverObj.current.drive();
        }
    }, 100);
  };

  const checkAndStartTour = () => {
      const tourCompleted = localStorage.getItem('tour_completed');
      if (!tourCompleted) {
        // Small delay to ensure UI is ready
        setTimeout(() => {
            startTour();
        }, 1500);
      }
  }

  return { startTour, checkAndStartTour };
};
