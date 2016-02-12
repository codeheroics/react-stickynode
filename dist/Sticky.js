/**
 * Copyright 2015, Yahoo! Inc.
 * Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
/* global window, document */

'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var React = require('react');

var classNames = require('classnames');
var propTypes = React.PropTypes;
var shallowCompare = require('react-addons-shallow-compare');
var subscribe = require('subscribe-ui-event').subscribe;

// constants
var STATUS_ORIGINAL = 0; // The default status, locating at the original position.
var STATUS_RELEASED = 1; // The released status, locating at somewhere on document but not default one.
var STATUS_FIXED = 2; // The sticky status, locating fixed to the top or the bottom of screen.
var TRANSFORM_PROP = 'transform';

// global variable for all instances
var doc;
var docBody;
var docEl;
var canEnableTransforms = true; // Use transform by default, so no Sticky on lower-end browser when no Modernizr
var M;
var scrollDelta = 0;
var scrollTop = -1;
var win;
var winHeight = -1;

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    win = window;
    doc = document;
    docEl = doc.documentElement;
    docBody = doc.body;
    scrollTop = docBody.scrollTop + docEl.scrollTop;
    winHeight = win.innerHeight || docEl.clientHeight;
    M = window.Modernizr;
    // No Sticky on lower-end browser when no Modernizr
    if (M) {
        canEnableTransforms = M.csstransforms3d;
        TRANSFORM_PROP = M.prefixed('transform');
    }
}

var Sticky = (function (_React$Component) {
    _inherits(Sticky, _React$Component);

    function Sticky(props, context) {
        _classCallCheck(this, Sticky);

        _get(Object.getPrototypeOf(Sticky.prototype), 'constructor', this).call(this, props, context);
        this.handleResize = this.handleResize.bind(this);
        this.handleScroll = this.handleScroll.bind(this);
        this.handleScrollStart = this.handleScrollStart.bind(this);
        this.delta = 0;
        this.stickyTop = 0;
        this.stickyBottom = 0;

        this.bottomBoundaryTarget;
        this.topTarget;
        this.subscribers;

        this.state = {
            top: 0, // A top offset px from screen top for Sticky when scrolling down
            bottom: 0, // A bottom offset px from screen top for Sticky when scrolling up *1*
            width: 0, // Sticky width
            height: 0, // Sticky height
            x: 0, // The original x of Sticky
            y: 0, // The original y of Sticky
            topBoundary: 0, // The top boundary on document
            bottomBoundary: Infinity, // The bottom boundary on document
            status: STATUS_ORIGINAL, // The Sticky status
            pos: 0, // Real y-axis offset for rendering position-fixed and position-relative
            activated: false // once browser info is available after mounted, it becomes true to avoid checksum error
        };
    }

    _createClass(Sticky, [{
        key: 'getTargetHeight',
        value: function getTargetHeight(target) {
            return target && target.offsetHeight || 0;
        }
    }, {
        key: 'getTopPosition',
        value: function getTopPosition(nextProps) {
            var self = this;
            var props = nextProps || self.props;
            // TODO, topTarget is for current layout, may remove
            var top = props.top || props.topTarget || 0;
            if (typeof top === 'string') {
                if (!self.topTarget) {
                    self.topTarget = doc.querySelector(top);
                }
                top = self.getTargetHeight(self.topTarget);
            }
            return top + props.marginTop;
        }
    }, {
        key: 'getTargetBottom',
        value: function getTargetBottom(target) {
            if (!target) {
                return -1;
            }
            var rect = target.getBoundingClientRect();
            return scrollTop + rect.bottom;
        }
    }, {
        key: 'getBottomBoundary',
        value: function getBottomBoundary(nextProps) {
            var self = this;
            var props = nextProps || self.props;

            var boundary = props.bottomBoundary;

            // TODO, bottomBoundary was an object, depricate it later.
            if (typeof boundary === 'object') {
                boundary = boundary.value || boundary.target || 0;
            }

            if (typeof boundary === 'string') {
                if (!self.bottomBoundaryTarget) {
                    self.bottomBoundaryTarget = doc.querySelector(boundary);
                }
                boundary = self.getTargetBottom(self.bottomBoundaryTarget);
            }
            return boundary && boundary > 0 ? boundary : Infinity;
        }
    }, {
        key: 'reset',
        value: function reset() {
            this.setState({
                status: STATUS_ORIGINAL,
                pos: 0
            });
        }
    }, {
        key: 'release',
        value: function release(pos) {
            this.setState({
                status: STATUS_RELEASED,
                pos: pos - this.state.y
            });
        }
    }, {
        key: 'fix',
        value: function fix(pos) {
            this.setState({
                status: STATUS_FIXED,
                pos: pos
            });
        }

        /**
         * Update the initial position, width, and height. It should update whenever children change.
         * @param {Object} nextProps in case we came here from componentWillReceiveProps
         */
    }, {
        key: 'updateInitialDimension',
        value: function updateInitialDimension(nextProps) {
            var self = this;

            self.timer = +new Date();
            var outer = self.refs.outer;
            var inner = self.refs.inner;
            var outerRect = outer.getBoundingClientRect();

            var width = outer.offsetWidth;
            var height = inner.offsetHeight;
            var outerY = outerRect.top + scrollTop;

            var marginBottom = nextProps && nextProps.marginBottom || this.props.marginBottom;
            var topPosition = self.getTopPosition(nextProps);

            self.setState({
                top: topPosition,
                bottom: Math.min(topPosition + height, winHeight - marginBottom),
                width: width,
                height: height,
                x: outerRect.left,
                y: outerY,
                bottomBoundary: self.getBottomBoundary(nextProps),
                topBoundary: outerY
            });
        }
    }, {
        key: 'handleResize',
        value: function handleResize(e, ae) {
            winHeight = ae.resize.height;
            this.updateInitialDimension();
            this.update();
        }
    }, {
        key: 'handleScrollStart',
        value: function handleScrollStart(e, ae) {
            scrollTop = ae.scroll.top;
            this.updateInitialDimension();
        }
    }, {
        key: 'handleScroll',
        value: function handleScroll(e, ae) {
            scrollDelta = ae.scroll.delta;
            scrollTop = ae.scroll.top;
            this.update();
        }

        /**
         * Update Sticky position.
         * In this function, all coordinates of Sticky and scren are projected to document, so the local variables
         * "top"/"bottom" mean the expected top/bottom of Sticky on document. They will move when scrolling.
         *
         * There are 2 principles to make sure Sticky won't get wrong so much:
         * 1. Reset Sticky to the original postion when "top" <= topBoundary
         * 2. Release Sticky to the bottom boundary when "bottom" >= bottomBoundary
         *
         * If "top" and "bottom" are between the boundaries, Sticky will always fix to the top of screen
         * when it is shorter then screen. If Sticky is taller then screen, then it will
         * 1. Fix to the bottom of screen when scrolling down and "bottom" > Sticky current bottom
         * 2. Fix to the top of screen when scrolling up and "top" < Sticky current top
         * (The above 2 points act kind of "bottom" dragging Sticky down or "top" dragging it up.)
         * 3. Release Sticky when "top" and "bottom" are between Sticky current top and bottom.
         */
    }, {
        key: 'update',
        value: function update() {
            var self = this;

            if (self.state.bottomBoundary - self.state.topBoundary <= self.state.height || !self.props.enabled) {
                if (self.state.status !== STATUS_ORIGINAL) {
                    self.reset();
                }
                return;
            }

            var delta = scrollDelta;
            var top = scrollTop + self.state.top;
            var bottom = scrollTop + self.state.bottom;

            if (top <= self.state.topBoundary) {
                self.reset();
            } else if (bottom >= self.state.bottomBoundary) {
                self.stickyBottom = self.state.bottomBoundary;
                self.stickyTop = self.stickyBottom - self.state.height;
                self.release(self.stickyTop);
            } else {
                if (self.state.height > winHeight) {
                    // In this case, Sticky is larger then screen
                    switch (self.state.status) {
                        case STATUS_ORIGINAL:
                            self.release(self.state.y);
                            self.stickyTop = self.state.y;
                            self.stickyBottom = self.stickyTop + self.state.height;
                            break;
                        case STATUS_RELEASED:
                            if (delta > 0 && bottom > self.stickyBottom) {
                                // scroll down
                                self.fix(self.state.bottom - self.state.height);
                            } else if (delta < 0 && top < self.stickyTop) {
                                // scroll up
                                this.fix(self.state.top);
                            }
                            break;
                        case STATUS_FIXED:
                            var isChanged = true;
                            if (delta > 0 && self.state.pos === self.state.top) {
                                // scroll down
                                self.stickyTop = top - delta;
                                self.stickyBottom = self.stickyTop + self.state.height;
                            } else if (delta < 0 && self.state.pos === self.state.bottom - self.state.height) {
                                // up
                                self.stickyBottom = bottom - delta;
                                self.stickyTop = self.stickyBottom - self.state.height;
                            } else {
                                isChanged = false;
                            }

                            if (isChanged) {
                                self.release(self.stickyTop);
                            }
                            break;
                    }
                } else {
                    self.fix(self.state.top);
                }
            }
            self.delta = delta;
        }
    }, {
        key: 'componentWillReceiveProps',
        value: function componentWillReceiveProps(nextProps) {
            if (this.props.bottomBoundary !== nextProps.bottomBoundary || this.props.top !== nextProps.top) {
                this.updateInitialDimension(nextProps);
                return this.update();
            }
            this.forceUpdate();
        }
    }, {
        key: 'componentWillUnmount',
        value: function componentWillUnmount() {
            var subscribers = this.subscribers || [];
            for (var i = subscribers.length - 1; i >= 0; i--) {
                this.subscribers[i].unsubscribe();
            }
        }
    }, {
        key: 'componentDidMount',
        value: function componentDidMount() {
            var self = this;
            if (self.props.enabled) {
                self.setState({ activated: true });
                self.updateInitialDimension();
                self.subscribers = [subscribe('scrollStart', self.handleScrollStart.bind(self), { useRAF: true }), subscribe('scroll', self.handleScroll.bind(self), { useRAF: true, enableScrollInfo: true }), subscribe('resize', self.handleResize.bind(self), { enableResizeInfo: true })];
            }
        }
    }, {
        key: 'translate',
        value: function translate(style, pos) {
            var enableTransforms = canEnableTransforms && this.props.enableTransforms;
            if (enableTransforms && this.state.activated) {
                style[TRANSFORM_PROP] = 'translate3d(0,' + pos + 'px,0)';
            } else {
                style.top = pos;
            }
        }
    }, {
        key: 'shouldComponentUpdate',
        value: function shouldComponentUpdate(nextProps, nextState) {
            return shallowCompare(this, nextProps, nextState);
        }
    }, {
        key: 'render',
        value: function render() {
            var self = this;
            // TODO, "overflow: auto" prevents collapse, need a good way to get children height
            var style = {
                position: self.state.status === STATUS_FIXED ? 'fixed' : 'relative',
                top: self.state.status === STATUS_FIXED ? '0' : ''
            };

            // always use translate3d to enhance the performance
            self.translate(style, self.state.pos);
            if (self.state.status !== STATUS_ORIGINAL) {
                style.width = self.state.width;
            }

            return React.createElement(
                'div',
                { ref: 'outer', className: classNames('sticky-outer-wrapper', self.props.className) },
                React.createElement(
                    'div',
                    { ref: 'inner', className: 'sticky-inner-wrapper', style: style },
                    self.props.children
                )
            );
        }
    }]);

    return Sticky;
})(React.Component);

Sticky.defaultProps = {
    enabled: true,
    top: 0,
    bottomBoundary: 0,
    marginTop: 0,
    marginBottom: 0,
    enableTransforms: true
};

/**
 * @param {Bool} enabled A switch to enable or disable Sticky.
 * @param {String/Number} top A top offset px for Sticky. Could be a selector representing a node
 *        whose height should serve as the top offset.
 * @param {String/Number} bottomBoundary A bottom boundary px on document where Sticky will stop.
 *        Could be a selector representing a node whose bottom should serve as the bottom boudary.
 */
Sticky.propTypes = {
    enabled: propTypes.bool,
    top: propTypes.oneOfType([propTypes.string, propTypes.number]),
    bottomBoundary: propTypes.oneOfType([propTypes.object, // TODO, may remove
    propTypes.string, propTypes.number]),
    enableTransforms: propTypes.bool,
    marginTop: propTypes.number,
    marginBottom: propTypes.number
};

module.exports = Sticky;
