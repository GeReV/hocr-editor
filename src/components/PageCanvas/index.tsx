
import { ItemId, Position } from '../../types';
import {
  createChangeSelected,
  createRedo,
  createSetDocumentImage,
  createSetDrawRect,
  createSetIsDrawing,
  createUndo,
} from '../../reducer/actions';
import { AppReducerAction, OcrDocument } from '../../reducer/types';
import { isAnyDocumentProcessing } from '../../reducer/selectors';
import ExportModal from '../ExportModal';
import { useHoveredState } from '../../hoverContext';
import { loadImage } from '../../utils';
import assert from '../../lib/assert';
import PageGraphics from './PageGraphics';
import CanvasToolbar from './CanvasToolbar';

import React, { Dispatch, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Stage } from 'react-konva';
import { useKey, useMeasure } from 'react-use';
import cx from 'classnames';
import { Button, Space } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IRect } from 'konva/types/types';


import './index.css';

interface Props {
  document: OcrDocument | undefined;
  documents: OcrDocument[];
  selectedId: ItemId | null;
  dispatch: Dispatch<AppReducerAction>;
  isDrawing?: boolean;
  drawRect?: IRect;
  hasUndo?: boolean;
  hasRedo?: boolean;
}

const SCALE_MAX = 3.0;
const SCALE_MIN = 0.05;

function PageCanvas({ document, documents, selectedId, dispatch, hasUndo, hasRedo, isDrawing, drawRect }: Props) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [showExport, setShowExport] = useState<boolean>(false);

  const [hoveredId] = useHoveredState();

  const stageRef = useRef<Stage>(null);

  const [ref, { width, height }] = useMeasure();

  useKey(
    'Escape',
    () => {
      dispatch(createSetIsDrawing(false));
    },
    undefined,
    [isDrawing],
  );

  const setFitScale = useCallback(() => {
    if (!document) {
      return;
    }

    const fitScale = document.width > document.height ? width / document.width : height / document.height;

    setScale(fitScale);
    setPosition({
      x: (width - document.width * fitScale) * 0.5,
      y: (height - document.height * fitScale) * 0.5,
    });
  }, [document, height, width]);

  useLayoutEffect(setFitScale, [setFitScale]);

  const handleSelected = useCallback(
    (itemId: ItemId | null) => {
      dispatch(createChangeSelected(itemId));
    },
    [dispatch],
  );

  const handleMouseWheel = useCallback(
    (evt: React.WheelEvent) => {
      // For some reason, the modal doesn't stop mouse wheel events (even with pointer-events: none),
      // so ignore them explicitly when modal is up.
      if (!stageRef.current || showExport) {
        return;
      }

      const stage = stageRef.current.getStage();

      const pointer = stage.getPointerPosition() ?? { x: 0, y: 0 };

      const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale * Math.pow(2, -evt.deltaY * 0.05)));

      const mousePointTo = {
        x: (pointer.x - stage.x()) / scale,
        y: (pointer.y - stage.y()) / scale,
      };

      const newPos: Position = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };

      setPosition(newPos);
      setScale(newScale);
    },
    [scale, showExport],
  );

  const handleLoadImage = useCallback(
    (evt: React.ChangeEvent<HTMLInputElement>) => {
      if (!document || !evt.currentTarget.files) {
        return;
      }

      const file = evt.currentTarget.files[0];

      assert(file, 'Expceted a file.');

      const reader = new FileReader();

      reader.onload = async (loadEvt: ProgressEvent<FileReader>) => {
        const pageImage = await loadImage(loadEvt.target?.result as ArrayBuffer, file.type);

        if (!pageImage) {
          return;
        }

        dispatch(createSetDocumentImage(document.id, pageImage));
      };

      reader.readAsArrayBuffer(file);
    },
    [dispatch, document],
  );

  const isAnyProcessing = useMemo(() => isAnyDocumentProcessing(documents), [documents]);

  return (
    <div className="Canvas" onWheel={handleMouseWheel}>
      <CanvasToolbar>
        <Button
          type="primary"
          disabled={!documents.length || isAnyProcessing || !document?.tree}
          onClick={() => setShowExport(true)}
        >
          <FontAwesomeIcon icon="file-export" /> Export
        </Button>

        <Button.Group>
          <Button
            title="Undo"
            onClick={() => dispatch(createUndo())}
            disabled={!hasUndo}
            icon={<FontAwesomeIcon icon="undo" />}
          />
          <Button
            title="Redo"
            onClick={() => dispatch(createRedo())}
            disabled={!hasRedo}
            icon={<FontAwesomeIcon icon="redo" />}
          />
        </Button.Group>

        <Button onClick={setFitScale} disabled={!document} title="Fit image" icon={<FontAwesomeIcon icon="expand" />} />
        <Button
          type={isDrawing ? 'primary' : 'default'}
          onClick={() => dispatch(createSetIsDrawing(!isDrawing))}
          disabled={!document}
          title="Select region"
          icon={<FontAwesomeIcon icon="vector-square" />}
        />
      </CanvasToolbar>
      <div className={cx('Canvas-main', isDrawing && 'Canvas-main--drawing')} ref={ref}>
        <PageGraphics
          document={document}
          ref={stageRef}
          width={width}
          height={height}
          onSelect={handleSelected}
          onDeselect={() => handleSelected(null)}
          hoveredId={hoveredId}
          selectedId={selectedId}
          scale={scale}
          position={position}
          setPosition={setPosition}
          isDrawing={isDrawing}
          onDraw={(rect) => dispatch(createSetDrawRect(rect))}
          drawRect={drawRect}
          dispatch={dispatch}
        />
        {document && !document.pageImage && (
          <Space className="Canvas-missing-image" size="large">
            This document is missing an image.
            <Button type="primary" size="small" className="Canvas-missing-image-upload">
              <input
                type="file"
                className="Canvas-missing-image-upload-input"
                onChange={handleLoadImage}
                accept="image/*"
              />
              Load an image
            </Button>
          </Space>
        )}
      </div>
      <ExportModal show={showExport} onClose={() => setShowExport(false)} document={document} />
    </div>
  );
}

export default PageCanvas;
