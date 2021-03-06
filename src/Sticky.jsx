/**
 * Copyright 2015, Yahoo! Inc.
 * Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
/* global window, document */

'use strict';

var React = require('react');

var classNames = require('classnames');
var propTypes = React.PropTypes;
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

class Sticky extends React.Component {
    constructor (props, context) {
        super(props, context);
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

    getTargetHeight (target) {
        return target && target.offsetHeight || 0;
    }

    getTopPosition (nextProps) {
        var self = this;
        var props = nextProps || self.props
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

    getTargetBottom (target) {
        if (!target) {
            return -1;
        }
        var rect = target.getBoundingClientRect();
        return scrollTop + rect.bottom;
    }

    getBottomBoundary (nextProps) {
        var self = this;
        var props = nextProps || self.props

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

    reset () {
        this.setState({
            status: STATUS_ORIGINAL,
            pos: 0
        });
    }

    release (pos) {
        // Calculating the outerY rect here instead of using the previously set
        // this.state.y previously prevents errors on IE9
        var outerRect = this.refs.outer.getBoundingClientRect();
        var outerY = Math.floor(outerRect.top + scrollTop);

        this.setState({
            status: STATUS_RELEASED,
            pos: pos - outerY
        });
    }

    fix (pos) {
        this.setState({
            status: STATUS_FIXED,
            pos: pos
        });
    }

    /**
     * Update the initial position, width, and height. It should update whenever children change.
     * @param {Object} nextProps in case we came here from componentWillReceiveProps
     * @returns {Object} The dimensions just set in the state
     */
    updateInitialDimension (nextProps) {
        var self = this;

        self.timer = +new Date;
        var outer = self.refs.outer;
        var inner = self.refs.inner;
        var outerRect = outer.getBoundingClientRect();

        var width = outer.offsetWidth;
        var height = inner.offsetHeight;
        var outerY = Math.floor(outerRect.top + scrollTop);

        var marginBottom = (nextProps && nextProps.marginBottom) || this.props.marginBottom
        var marginTop = (nextProps && nextProps.marginTop) || this.props.marginTop
        var topPosition = self.getTopPosition(nextProps)

        var nextState = {
            top: topPosition,
            bottom: Math.min(topPosition + height, winHeight - marginBottom),
            width: width,
            height: height,
            x: outerRect.left,
            y: outerY,
            bottomBoundary: self.getBottomBoundary(nextProps),
            topBoundary: outerY + marginTop
        }

        self.setState(nextState);
        return nextState
    }

    handleResize (e, ae) {
        winHeight = ae.resize.height;
        var newDimensions = this.updateInitialDimension();
        this.update(newDimensions);
    }

    handleScrollStart (e, ae) {
        scrollTop = ae.scroll.top;
        this.updateInitialDimension();
    }

    handleScroll (e, ae) {
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
     *
     * @param {Object} newDimensions An object which takes priority over this.state.
     *   Useful when dimensions were just updated, as this.state is updated asynchronously
     *
     */
    update (newDimensions) {
        var self = this
        var state = newDimensions ? newDimensions : this.state

        if (state.bottomBoundary - state.topBoundary <= state.height || !self.props.enabled) {
            if (state.status !== STATUS_ORIGINAL) {
                self.reset();
            }
            return;
        }

        var delta = scrollDelta;
        var top = scrollTop + state.top;
        var bottom = scrollTop + state.bottom;

        if (top <= state.topBoundary) {
            self.reset();
        } else if (bottom >= state.bottomBoundary) {
            self.stickyBottom = state.bottomBoundary;
            self.stickyTop = self.stickyBottom - state.height;
            self.release(self.stickyTop);
        } else {
            if (state.height > winHeight - state.top) {
                // In this case, Sticky is larger then screen minus sticky top
                switch (self.state.status) {
                    case STATUS_ORIGINAL:
                        self.release(state.y);
                        self.stickyTop = state.y;
                        self.stickyBottom = self.stickyTop + state.height;

                        // Possible case: Big scrolls (eg. page down)
                        // forces us to need to fix immediately from original
                        if (delta > 0 && bottom > self.stickyBottom) { // scroll down
                            self.fix(state.bottom - state.height);
                        }
                        break;
                    case STATUS_RELEASED:
                        if (delta > 0 && bottom > self.stickyBottom) { // scroll down
                            self.fix(state.bottom - state.height);
                        } else if (delta < 0 && top < self.stickyTop) { // scroll up
                            this.fix(state.top);
                        }
                        break;
                    case STATUS_FIXED:
                        var isChanged = true;
                        if (delta > 0 && state.pos === state.top) { // scroll down
                            self.stickyTop = top - delta;
                            self.stickyBottom = self.stickyTop + state.height;
                        } else if (delta < 0 && state.pos === state.bottom - state.height) { // up
                            self.stickyBottom = bottom - delta;
                            self.stickyTop = self.stickyBottom - state.height;
                        } else {
                            isChanged = false;
                        }

                        if (isChanged) {
                            self.release(self.stickyTop);
                        }
                        break;
                }
            } else {
                self.fix(state.top);
            }
        }
        self.delta = delta;
    }

    componentWillReceiveProps (nextProps) {
        if (
          this.props.bottomBoundary !== nextProps.bottomBoundary ||
          this.props.top !== nextProps.top ||
          nextProps.updateDimensionsOnReceiveProps
        ) {
          var newDimensions = this.updateInitialDimension(nextProps);
          this.update(newDimensions);
        }
    }

    componentWillUnmount () {
        var subscribers = this.subscribers || [];
        for (var i = subscribers.length - 1; i >= 0; i--) {
            this.subscribers[i].unsubscribe();
        }
    }

    componentDidMount () {
        var self = this;
        if (self.props.enabled) {
            self.setState({activated: true});
            self.updateInitialDimension();
            self.subscribers = [
                subscribe('scrollStart', self.handleScrollStart.bind(self), {useRAF: true}),
                subscribe('scroll', self.handleScroll.bind(self), {useRAF: true, enableScrollInfo: true}),
                subscribe('resize', self.handleResize.bind(self), {enableResizeInfo: true})
            ];
        }
    }

    translate (style, pos) {
        var enableTransforms = canEnableTransforms && this.props.enableTransforms
        if (enableTransforms && this.state.activated) {
            style[TRANSFORM_PROP] = 'translate3d(0,' + pos + 'px,0)';
        } else {
            style.top = pos;
        }
    }

    render () {
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

        return (
            <div ref='outer' className={classNames('sticky-outer-wrapper', self.props.className)}>
                <div ref='inner' className='sticky-inner-wrapper' style={style}>
                    {self.props.children}
                </div>
            </div>
        );
    }
}

Sticky.defaultProps = {
    enabled: true,
    top: 0,
    bottomBoundary: 0,
    marginTop: 0,
    marginBottom: 0,
    enableTransforms: true,
    updateDimensionsOnReceiveProps: false
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
    top: propTypes.oneOfType([
        propTypes.string,
        propTypes.number
    ]),
    bottomBoundary: propTypes.oneOfType([
        propTypes.object,  // TODO, may remove
        propTypes.string,
        propTypes.number
    ]),
    updateDimensionsOnReceiveProps: propTypes.bool,
    enableTransforms: propTypes.bool,
    marginTop: propTypes.number,
    marginBottom: propTypes.number
};

module.exports = Sticky;
