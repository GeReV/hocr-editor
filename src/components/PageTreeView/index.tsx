import React from "react";
import cx from 'classnames';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconName } from "@fortawesome/free-solid-svg-icons";
import { Row } from 'react-bootstrap';

import { ElementType, DocumentTreeItem } from "../../types";
import { createChangeHovered, createChangeSelected, createModifyNode, createMoveNode } from "../../reducer/actions";
import { useAppReducer } from "../../reducerContext";
import Tree from "../SortableTree/components/Tree";
import {
  ItemId,
  Path,
  RenderItemParams,
  TreeDestinationPosition,
  TreeSourcePosition
} from "../SortableTree";

import './index.scss';

interface Props {
}

function getTypeSpec(node: DocumentTreeItem): { icon: IconName | null; iconTitle?: string; title: string; } {
  switch (node.type) {
    case ElementType.Block:
      return {
        icon: 'square',
        iconTitle: 'Block',
        title: node.data.text.trim() || node.data.blocktype,
      };
    case ElementType.Paragraph:
      return {
        icon: 'paragraph',
        iconTitle: 'Paragraph',
        title: node.data.text.trim()
      };
    case ElementType.Line:
      return {
        icon: 'i-cursor',
        iconTitle: 'Line',
        title: node.data.text.trim()
      };
    case ElementType.Word:
      return {
        icon: null,
        title: node.data.text.trim()
      };
    case ElementType.Symbol:
      return {
        icon: 'font',
        iconTitle: 'Symbol',
        title: node.data.text.trim()
      };
    default: {
      return {
        icon: null,
        title: node.data.text.trim(),
      };
    }
  }
}

// function reconstructTree<T extends BaseTreeItem<ElementType, any>, R extends TesseractTreeItem>(tree: number[], resolveChild: (childId: number) => T, transform: (item: T) => R): R[] {
//   function walk(item: T): R {
//     const transformedItem = transform(item);
//
//     transformedItem.children = reconstructTree(item.children, resolveChild, transform);
//
//     return transformedItem;
//   }
//
//   return tree
//     .map(resolveChild)
//     .map(block => walk(block));
// }

function truncate(s: string, len: number = 20): string {
  if (s.length <= len) {
    return s;
  }

  // Slice and add ellipsis.
  return `${s.slice(0, len).trim()}\u2026`;
}

// function buildTree(tree: number[], treeItems: TreeItems): TesseractTreeItem[] {
//   return reconstructTree<DocumentTreeItem, ExtendedTreeItem<ElementType, any>>(
//     tree,
//     childId => {
//       const child = treeItems[childId];
//
//       if (!child) {
//         throw new Error(`Could not find child with ID ${childId} in tree.`);
//       }
//
//       return child;
//     },
//     (child) => {
//       const {
//         title,
//         icon,
//         iconTitle,
//       } = getTypeSpec(child);
//
//       return {
//         id: child.id,
//         type: child.type,
//         value: child.value,
//         title: (
//           <span title={title}>
//             {
//               icon ? (
//                 <>
//                   <FontAwesomeIcon icon={icon} title={iconTitle} />
//                   {' '}
//                 </>
//               ): null
//             }
//             {truncate(title)}
//           </span>
//         ),
//         expanded: child.type === ElementType.Block || child.type === ElementType.Paragraph,
//       };
//     }
//   );
// }
//
// function canDrop(data: OnDragPreviousAndNextLocation & NodeData & { node: DocumentTreeItem; prevParent: DocumentTreeItem | null; nextParent: DocumentTreeItem | null; }): boolean {
//   if (!data.nextParent) {
//     // Moving to/within root level. Only blocks can do that.
//     return data.node.type === ElementType.Block;
//   }
//
//   // Nodes can only move under a parent of the same type.
//   // For example, lines can only go under paragraphs.
//   const canMoveUnderParent = data.nextParent.type === data.node.type - 1;
//
//   if (canMoveUnderParent && data.nextParent.type === ElementType.Block) {
//     // Only certain type of blocks can have children.
//     return canBlockHostChildren(data.nextParent.value);
//   }
//
//   return canMoveUnderParent;
// }

interface TreeNodeProps {
  isSelected?: boolean;
  onMouseEnter?: (evt: React.MouseEvent, nodeId: ItemId) => void;
  onClick?: (evt: React.MouseEvent, nodeId: ItemId) => void;
}

const TreeNode = React.memo(function TreeNode({ item, provided, onCollapse, onExpand, onMouseEnter, onClick, isSelected }: RenderItemParams & TreeNodeProps) {
  let button: React.ReactElement | null = null;

  if (item.children && item.children.length > 0) {
    button = item.isExpanded ? (
      <button
        type="button"
        onClick={() => onCollapse(item.id)}
        className="Tree-collapseButton"
      />
    ) : (
      <button
        type="button"
        onClick={() => onExpand(item.id)}
        className="Tree-expandButton"
      />
    );
  }
  
  const {
    title,
    icon,
    iconTitle,
  } = getTypeSpec(item as DocumentTreeItem);

  return (
    <div
      className={cx('Tree-rowContents', isSelected && 'Tree-rowContents--selected')}
      ref={provided.innerRef}
      onMouseEnter={(evt) => onMouseEnter?.(evt, item.id)}
      onClick={(evt) => onClick?.(evt, item.id)}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
    >
      {button}
      <div
        className="Tree-rowLabel"
        title={title}
      >
        {
          icon && (
            <><FontAwesomeIcon icon={icon} title={iconTitle} />{' '}</>
          )
        }
        {truncate(title)}
      </div>
    </div>
  )
});

export default function PageTreeView(props: Props) {
  const [state, dispatch] = useAppReducer();

  // function handleChange(newData: TesseractTreeItem[]): void {
  // }
  //
  function handleDragEnd(source: TreeSourcePosition, destination?: TreeDestinationPosition) {
    if (!destination) {
      return;
    }
    
    dispatch(createMoveNode({
      source, 
      destination
    }));
  }
  
  function onMouseEnter(evt: React.MouseEvent, nodeId: ItemId) {
    evt.stopPropagation();

    dispatch(createChangeHovered(nodeId));
  }

  function onMouseLeave(evt: React.MouseEvent) {
    evt.stopPropagation();

    dispatch(createChangeHovered(null));
  }
  
  function onSelect(evt: React.MouseEvent, nodeId: ItemId) {
    evt.stopPropagation();
    
    dispatch(createChangeSelected(nodeId));
  }
  
  function handleCollapse(itemId: ItemId, path: Path) {
    dispatch(createModifyNode(itemId, { isExpanded: false }));
  }

  function handleExpand(itemId: ItemId, path: Path) {
    dispatch(createModifyNode(itemId, { isExpanded: true }));
  }

  if (!state.tree) {
    return null;
  }

  return (
    <Row
      className="Tree"
      onMouseLeave={onMouseLeave}
    >
      <Tree
        tree={state.tree}
        onExpand={handleExpand}
        onCollapse={handleCollapse}
        onDragEnd={handleDragEnd}
        renderItem={(params) => (
          <TreeNode
            onMouseEnter={onMouseEnter}
            onClick={onSelect}
            isSelected={state.selectedId === params.item.id} 
            {...params} 
          />
        )}
        offsetPerLevel={24}
        isDragEnabled
        isNestingEnabled
      />
    </Row>
  );
}
