import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import Breadcrumbs from "./Breadcrumbs.vue";
import HeroVideo from "./HeroVideo.vue";

import "./custom.css";

export default {
	extends: DefaultTheme,
	Layout: () => {
		return h(DefaultTheme.Layout, null, {
			// A trail above each page. Only one level deep today, but the sections
			// are about to gain nested pages.
			"doc-before": () => h(Breadcrumbs),
			// The homepage hero's right-hand column
			"home-hero-image": () => h(HeroVideo),
		});
	},
};
