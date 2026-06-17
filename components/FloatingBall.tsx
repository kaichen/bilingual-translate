import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { config } from '@/entrypoints/utils/config';
import './FloatingBall.css';

export interface FloatingBallHandle {
  element: HTMLElement | null;
  getIsTranslating: () => boolean;
  setIsTranslating: (value: boolean, animate?: boolean) => void;
}

interface FloatingBallProps {
  position?: 'left' | 'right';
  onSettingsClick?: (event: MouseEvent) => void;
  onPositionChanged?: (newPosition: 'left' | 'right') => void;
  onTranslationToggle?: (isTranslating: boolean) => void;
  iconType?: 'simple' | 'morden';
  shortcutTip?: string;
}

const FloatingBall = forwardRef<FloatingBallHandle, FloatingBallProps>(
  (
    {
      position = 'right',
      onPositionChanged = () => {},
      onTranslationToggle = () => {},
      iconType = 'morden',
      shortcutTip = '快捷键: Alt+T',
    },
    ref,
  ) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [positionStyle, setPositionStyle] = useState<CSSProperties>({});
    const [isDragging, setIsDragging] = useState(false);
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
    const [draggedY, setDraggedY] = useState<number | null>(null);
    const [internalPosition, setInternalPosition] = useState<'left' | 'right'>(position);
    const [isTranslating, setIsTranslating] = useState(false);
    const [dragStartTime, setDragStartTime] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [showShortcutTooltip, setShowShortcutTooltip] = useState(false);
    const floatingBallRef = useRef<HTMLDivElement | null>(null);
    const rippleContainerRef = useRef<HTMLDivElement | null>(null);
    const latestIsTranslating = useRef(false);
    const latestStartPoint = useRef(startPoint);
    const latestDragStartTime = useRef(dragStartTime);

    useEffect(() => {
      latestIsTranslating.current = isTranslating;
    }, [isTranslating]);

    useEffect(() => {
      latestStartPoint.current = startPoint;
    }, [startPoint]);

    useEffect(() => {
      latestDragStartTime.current = dragStartTime;
    }, [dragStartTime]);

    const currentDisplayPosition = useMemo(() => internalPosition || position, [internalPosition, position]);

    const updatePositionStyle = () => {
      if (isDragging) return;

      setPositionStyle({
        top: draggedY !== null ? `${draggedY}px` : '50%',
        left: undefined,
        right: undefined,
        transform: undefined,
      });
    };

    const addRippleEffect = (color = '#4caf50') => {
      const container = rippleContainerRef.current;
      if (!container) return;

      const ripple = document.createElement('div');
      ripple.classList.add('ripple');
      ripple.style.backgroundColor = color;
      container.appendChild(ripple);

      window.setTimeout(() => {
        ripple.classList.add('active');
        window.setTimeout(() => {
          if (container.contains(ripple)) {
            container.removeChild(ripple);
          }
        }, 600);
      }, 10);
    };

    const triggerAnimation = (type: 'translate' | 'restore') => {
      if (!config.animations) return;

      setIsAnimating(true);
      addRippleEffect(type === 'translate' ? '#4285f4' : '#4caf50');
      setShowShortcutTooltip(true);

      window.setTimeout(() => setShowShortcutTooltip(false), 2000);
      window.setTimeout(() => setIsAnimating(false), 500);
    };

    const applyTranslationState = (nextState: boolean, notify: boolean, animate = true) => {
      setIsTranslating(nextState);
      if (animate) {
        triggerAnimation(nextState ? 'translate' : 'restore');
      }
      if (notify) {
        onTranslationToggle(nextState);
      }
    };

    useImperativeHandle(ref, () => ({
      element: floatingBallRef.current,
      getIsTranslating: () => latestIsTranslating.current,
      setIsTranslating: (value: boolean, animate = true) => {
        applyTranslationState(value, false, animate);
      },
    }));

    useEffect(() => {
      setInternalPosition(position);
      setDraggedY(null);
    }, [position]);

    useEffect(() => {
      updatePositionStyle();
    }, [draggedY]);

    useEffect(() => {
      const handleResize = () => updatePositionStyle();
      const handleClickOutside = (event: MouseEvent) => {
        const element = floatingBallRef.current;
        if (!element || element.matches(':hover')) return;
        if (!element.contains(event.target as Node)) {
          setIsExpanded(false);
        }
      };
      const handleMouseMove = (event: MouseEvent) => {
        const element = floatingBallRef.current;
        if (element?.contains(event.target as Node)) {
          setIsExpanded(true);
        }
      };

      window.addEventListener('resize', handleResize);
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('mousemove', handleMouseMove);

      return () => {
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('mousemove', handleMouseMove);
      };
    }, []);

    const startDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
      const element = floatingBallRef.current;
      if (event.button !== 0 || !element) return;

      const rect = element.getBoundingClientRect();
      setIsDragging(true);
      setIsExpanded(false);
      setStartPoint({ x: event.clientX, y: event.clientY });
      setDragStartTime(Date.now());
      setPositionStyle({
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        right: 'auto',
        transform: 'none',
      });

      event.preventDefault();
    };

    useEffect(() => {
      if (!isDragging) return;

      const handleDrag = (event: MouseEvent) => {
        const element = floatingBallRef.current;
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const offsetX = event.clientX - latestStartPoint.current.x;
        const offsetY = event.clientY - latestStartPoint.current.y;
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;

        setPositionStyle({
          left: `${Math.max(0, Math.min(rect.left + offsetX, maxX))}px`,
          top: `${Math.max(0, Math.min(rect.top + offsetY, maxY))}px`,
          right: 'auto',
          transform: 'none',
        });
        setStartPoint({ x: event.clientX, y: event.clientY });
      };

      const stopDrag = (event: MouseEvent) => {
        const element = floatingBallRef.current;
        if (!element) return;

        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', stopDrag);
        setIsDragging(false);

        const rect = element.getBoundingClientRect();
        const newPosition = event.clientX < window.innerWidth / 2 ? 'left' : 'right';
        setDraggedY(rect.top);
        setInternalPosition(newPosition);
        onPositionChanged(newPosition);
      };

      document.addEventListener('mousemove', handleDrag);
      document.addEventListener('mouseup', stopDrag);

      return () => {
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', stopDrag);
      };
    }, [isDragging, onPositionChanged]);

    const toggleTranslation = (event: ReactMouseEvent<HTMLDivElement>) => {
      const movedX = Math.abs(event.clientX - latestStartPoint.current.x);
      const movedY = Math.abs(event.clientY - latestStartPoint.current.y);
      const dragDuration = Date.now() - latestDragStartTime.current;
      const isDragEndClick = dragDuration > 150 || movedX > 5 || movedY > 5;

      if (isDragEndClick || isDragging) return;

      const nextState = !latestIsTranslating.current;
      applyTranslationState(nextState, true);
      if (floatingBallRef.current?.matches(':hover')) {
        setIsExpanded(true);
      }
    };

    return (
      <div
        ref={floatingBallRef}
        className={[
          'bt-floating-ball',
          isExpanded ? 'floating-ball-expanded' : '',
          isDragging ? 'dragging' : '',
          isTranslating ? 'is-translating' : '',
          isAnimating && config.animations ? 'animating' : '',
          !config.animations ? 'static-mode' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-position={currentDisplayPosition}
        style={positionStyle}
        onMouseEnter={() => !isDragging && setIsExpanded(true)}
        onMouseLeave={() => !isDragging && !floatingBallRef.current?.matches(':hover') && setIsExpanded(false)}
        onMouseDown={startDrag}
        onClick={toggleTranslation}
      >
        <div className="floating-ball-icon">
          <div className="bt-icon-container">
            {iconType === 'simple' ? (
              <svg className="translation-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12.87 15.07L10.33 12.56L10.36 12.53C12.1 10.59 13.34 8.36 14.07 6H17V4H10V2H8V4H1V6H12.17C11.5 7.92 10.44 9.75 9 11.35C8.07 10.32 7.3 9.19 6.69 8H4.69C5.42 9.63 6.42 11.17 7.67 12.56L2.58 17.58L4 19L9 14L12.11 17.11L12.87 15.07Z"
                  fill={isTranslating ? '#4caf50' : '#333'}
                />
              </svg>
            ) : (
              <svg
                className={`imt-fb-logo-img-big-bg translation-icon ${isTranslating ? 'imt-float-ball-translated' : ''}`}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="20"
                height="20"
              >
                <path fill="none" d="M0 0h24v24H0z" />
                <path
                  d="M5 15v2a2 2 0 0 0 1.85 1.995L7 19h3v2H7a4 4 0 0 1-4-4v-2h2zm13-5l4.4 11h-2.155l-1.201-3h-4.09l-1.199 3h-2.154L16 10h2zm-1 2.885L15.753 16h2.492L17 12.885zM8 2v2h4v7H8v3H6v-3H2V4h4V2h2zm9 1a4 4 0 0 1 4 4v2h-2V7a2 2 0 0 0-2-2h-3V3h3zM6 6H4v3h2V6zm4 0H8v3h2V6z"
                  fill="rgba(255,255,255,1)"
                />
              </svg>
            )}

            {isTranslating && <div className="check-mark" />}
            {showShortcutTooltip && <div className="shortcut-tooltip">{shortcutTip}</div>}
            <div className="ripple-container" ref={rippleContainerRef} />
          </div>
        </div>
      </div>
    );
  },
);

export default FloatingBall;
