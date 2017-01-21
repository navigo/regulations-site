'use strict';
var $ = require('jquery');
var _ = require('underscore');
var Backbone = require('backbone');
require('../../events/scroll-stop.js');
var LazyLoad = require('jquery-lazyload');
var DefinitionView = require('../sidebar/definition-view');
var RegModel = require('../../models/reg-model');
var SectionFooterView = require('./section-footer-view');
var Router = require('../../router');
var MainEvents = require('../../events/main-events');
var HeaderEvents = require('../../events/header-events');
var SidebarEvents = require('../../events/sidebar-events');
var Helpers = require('../../helpers');
var DrawerEvents = require('../../events/drawer-events');
var ChildView = require('./child-view');
var GAEvents = require('../../events/ga-events');
Backbone.$ = $;

var RegView = ChildView.extend({
    events: {
        'click .definition': 'termLinkHandler',
        'click .inline-interp-header': 'expandInterp'
    },

    initialize: function(options) {
        this.options = options;

        this.listenTo(MainEvents, 'definition:close', this.closeDefinition);
        this.listenTo(MainEvents, 'definition:carriedOver', this.checkDefinitionScope);
        this.listenTo(MainEvents, 'paragraph:active', this.newActiveParagraph);

        DrawerEvents.trigger('pane:init', 'table-of-contents');

        this.id = this.options.id;
        this.regVersion = this.options.regVersion;
        this.activeSection = this.options.id;
        this.$activeSection = $('#' + this.activeSection);
        this.$sections = {};
        this.url = this.id + '/' + this.options.regVersion;
        this.docId = this.options.docId;
        this.cfrTitle = this.options.cfrTitle;

        if (Router.hasPushState) {
            this.events['click .inline-interpretation .section-link'] = 'openInterp';
            this.events['click .citation.internal'] = 'openSection';
            this.events['click .section-nav .navigation-link'] = 'openSection';
            this.delegateEvents();
        }

        ChildView.prototype.initialize.apply(this, arguments);
        HeaderEvents.trigger('section:open', this.sectionLabel);
    },

    // only concerned with resetting DOM, no matter
    // what way the definition was closed
    closeDefinition: function() {
        this.clearActiveTerms();
    },

    toggleDefinition: function($link) {
        this.setActiveTerm($link);

        return this;
    },

    openSection: function(e) {
      var $target = $(e.currentTarget);
      var id = $target.attr('data-section-id') || $target.attr('data-linked-section');
      var href = $target.attr('href');
      var config = {};
      var hashIndex;

      if (typeof href !== 'undefined') {
        hashIndex = href.indexOf('#');
      }

      if (id) {
        e.preventDefault();
        config.id = id;

        if (hashIndex !== -1) {
          config.scrollToId = href.substr(hashIndex + 1);
        }

        MainEvents.trigger('section:open', Helpers.findBaseSection(id), config, 'reg-section');
      }
    },

    assembleTitle: function() {
      if (this.options.subContentType === 'supplement') {
        return 'Supplement I to Part ' + this.docId + ' | Markup';
      } else if (this.options.subContentType === 'appendix') {
        return 'Appendix ' + this.id.substr(this.id.length - 1) + ' to Part ' + this.docId + ' | Markup';
      } else {
        return this.cfrTitle + ' CFR ' + this.sectionLabel + ' | Markup';
      }
    },

    // if an inline definition is open, check the links here to see
    // if the definition is still in scope in this section
    checkDefinitionScope: function() {
        var $def = $('#definition'),
            defTerm = $def.data('defined-term'),
            defId = $def.find('.open-definition').attr('id'),
            $termLinks,
            eventTriggered = false;

        if (defTerm && defId && $def.length > 0) {
            this.defScopeExclusions = this.defScopeExclusions || [];
            $termLinks = this.$el.find('a.definition');

            $termLinks.each(function(i, link) {
                var $link = $(link);

                if ($link.data('defined-term') === defTerm && $link.data('definition') !== defId) {
                    // don't change the DOM over and over for no reason
                    // if there are multiple defined term links that
                    // are scoped to a different definition body
                    if (!eventTriggered) {
                        SidebarEvents.trigger('definition:outOfScope', this.id);
                        eventTriggered = true;
                    }

                    this.defScopeExclusions.push($link.closest('li[data-permalink-section]').attr('id'));
                }
            }.bind(this));

            if (this.defScopeExclusions.length === 0) {
                SidebarEvents.trigger('definition:inScope');
            }
        }
    },

    // id = active paragraph
    newActiveParagraph: function(id) {
        var $newDefLink, newDefId, newDefHref;
        // if there are paragraphs where the open definition is
        // out of scope, display message
        // else be sure there's no out of scope message displayed
        if (typeof this.defScopeExclusions !== 'undefined') {
            if (this.defScopeExclusions.indexOf(id) !== -1) {
                $newDefLink = this.$activeSection.find(
                    '.definition[data-defined-term="' + $('#definition').data('definedTerm') + '"]'
                ).first();
                newDefId = $newDefLink.data('definition');
                newDefHref = $newDefLink.attr('href');

                SidebarEvents.trigger('definition:deactivate', newDefId, newDefHref, this.activeSection);
            }
            else {
                SidebarEvents.trigger('definition:activate');
            }
        }
    },

    render: function() {
        ChildView.prototype.render.apply(this, arguments);

        this.checkDefinitionScope();
    },

    // content section key term link click handler
    termLinkHandler: function(e) {
        e.preventDefault();

        var $link = $(e.target),
            defId = $link.data('definition'),
            term = $link.data('defined-term');

        // if this link is already active, toggle def shut
        if ($link.data('active')) {
            SidebarEvents.trigger('definition:close');
            GAEvents.trigger('definition:close', {
                type: 'defintion',
                by: 'toggling term link'
            });
            this.clearActiveTerms();
        }
        else {
            // if its the same definition, diff term link
            if ($('.open-definition').attr('id') === defId) {
                this.toggleDefinition($link);
            }
            else {
                // close old definition, if there is one
                SidebarEvents.trigger('definition:close');
                GAEvents.trigger('definition:close', {
                    type: 'defintion',
                    by: 'opening new definition'
                });

                // open new definition
                this.setActiveTerm($link);
                SidebarEvents.trigger('definition:open', {
                    'id': defId,
                    'term': term
                });
                GAEvents.trigger('definition:open', {
                    id: defId,
                    from: this.activeSection,
                    type: 'definition'
                });
            }
        }

        return this;
    },

    // handler for when inline interpretation is clicked
    expandInterp: function(e) {
        // user can click anywhere in the header of a closed interp
        // for an open interp, they can click "hide" button or header
        e.stopImmediatePropagation();
        e.preventDefault();
        var header = $(e.currentTarget),
            section = header.parent(),
            button = header.find('.expand-button'),
            buttonText = header.find('.expand-text'),
            context = {
                id: section.data('interp-id'),
                to: section.data('interp-for'),
                type: 'inline-interp'
            };

        section.toggleClass('open');
        //  may include multiple sections
        section.find('.hidden').slideToggle();
        button.toggleClass('open');
        buttonText.html(section.hasClass('open') ? 'Hide' : 'Show');

        if (section.hasClass('open')) {
            GAEvents.trigger('interp:expand', context);
        }
        else {
            GAEvents.trigger('interp:collapse', context);
        }

        return this;
    },

    // Sets DOM back to neutral state
    clearActiveTerms: function() {
        this.$el.find('.active.definition')
            .removeClass('active')
            .removeData('active');
    },

    setActiveTerm: function($link) {
        this.clearActiveTerms();
        $link.addClass('active').data('active', 1);
    },

    openInterp: function(e) {
        e.preventDefault();

        var sectionId = $(e.currentTarget).data('linked-section'),
            subSectionId = $(e.currentTarget).data('linked-subsection'),
            version = $('section[data-base-version]').data('base-version');

        Router.navigate(sectionId + '/' + version + '#' + subSectionId, {trigger: true});

        GAEvents.trigger('interp:followCitation', {
            id: subSectionId,
            regVersion: version,
            type: 'inline-interp'
        });
    }
});

module.exports = RegView;
